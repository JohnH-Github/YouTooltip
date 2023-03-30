"use strict";


const regexs = {
	videos: /(?:\.|\/)(?:youtube\.com\/(?:watch\?.*v=|shorts\/)|youtu\.be\/)([^\&\?]{5,})/,
	playlists: /(?:\.|\/)youtube\.com\/playlist\?list=([^\&\?]{5,})/
};

const rickRollIds = [// Small collection of common rickrolls for statistics.
	"dQw4w9WgXcQ",
	"LLFhKaqnWwk",
	"oHg5SJYRHA0",
	"xvFZjo5PgG0",
	"iik25wqIuFo",
	"ub82Xb1C8os",
	"eBGIQ7ZuuiU",
	"8ybW48rKBME",
	"xbXoWRs2C8M",
	"xfr64zoBTAQ",
	"QB7ACr7pUuE",
	"Yb6dZ1IFlKc",
	"PzqQSOaCcnw"
];

const elementMap = {
	videos: new Map(),
	playlists: new Map()
};
const dataMap = {
	videos: new Map(),
	playlists: new Map()
};

var options;
var keyDefault;
var onStorageChangeCounter = 0;
var customTooltipCSSImportant = "";
const disabledOnSite = {
	state: false,
	reason: ""
};

/*
 * Checks if the site is an alternative front-end that contains direct links to youtube.
 * Definitely not a good solution, but it works for now.
 */
function isAlternateFrontend(url) {
	if (document.head) {
		let urlObj = new URL(url);
		return (urlObj.hostname === "tube.cadence.moe" ||// Cloudtube
			document.head.querySelector("meta[name=description]")?.content === "An alternative front-end to YouTube");// Invidious
	} else {
		return false;
	}
}

/*
 * Checks if the site is blacklisted in the options.
 */
function isBlacklisted(url) {
	let urlObj = new URL(url);
	return options.blacklist.some(excludeMatch => {
		if (excludeMatch === "")
			return false;
		let escapedString = excludeMatch.replace(/[()|[\]{}]/g, "\\$&");
		let replacedString = "(^|\\.)" + escapedString.replaceAll(".", "\\.") + "$";
		let urlRegex = new RegExp(replacedString, "i");
		return urlRegex.test(urlObj.hostname);
	});
}

/*
 * Initializes the script by retrieving options, scanning the page, and starting the observer.
 */
async function init() {
	try {
		let storageOptions = await browser.storage.local.get("options");
		if (storageOptions.options === undefined && onStorageChangeCounter < 5) {
			// If YouTooltip was just installed, options won't exist in storage immediately. We will wait until it does, then try again.
			onStorageChangeCounter++;// And make sure we don't get into an infinite loop if things don't work as expected.
			browser.storage.local.onChanged.addListener(onStorageChange);
		} else if (storageOptions.options !== undefined) {
			options = storageOptions.options;
			if (options.operationMode === "auto" || options.apiService === "google") {
				if (options.keyCustom === "") {
					keyDefault = await browser.runtime.sendMessage({
						command: "getKeyDefault",
						index: options.keyDefaultIndex
					});
				}
			} else {
				await browser.runtime.sendMessage({});// Send empty message in case the popup is listening.
			}
			if (options.displayMode === "customTooltip") {
				const cssList = options.customTooltipCSS.split(";");
				cssList.forEach((declaration, index) => {
					if (declaration !== "" && !declaration.includes("!"))
						cssList[index] = `${declaration} !important`;
				});
				customTooltipCSSImportant = cssList.join(";");
			} else if (options.displayMode === "notification") {
				let gotPermission = await browser.runtime.sendMessage({
					command: "hasPermission",
					permissions: {permissions: ["notifications"]}
				});
				if (!gotPermission) {
					options.displayMode = "tooltip";// Fall back to tooltips if we don't have the notification permission.
					console.warn("YouTooltip does not have notification permission. Falling back to tooltips.");
				}
			}
			
			// Check after sending messages to make sure the popup receives them if it is listening.
			if (isAlternateFrontend(window.location)) {
				disabledOnSite.state = true;
				disabledOnSite.reason = "alternateFrontend";
				return;
			}
			if (isBlacklisted(window.location)) {
				disabledOnSite.state = true;
				disabledOnSite.reason = "blacklisted";
				return;
			}
			
			if (document.body) {
				// Check all anchor elements and set the appropriate tooltips.
				let linkMapBuckets = getLinkMap(getElementsWithValidLinks(document.getElementsByTagName("a")));
				setNewLinks(linkMapBuckets);
				
				// Start observing.
				observer.observe(document.body, {childList: true, subtree: true});
			}
		} else {
			throw `Could not retrieve options from storage. onStorageChange tries: ${onStorageChangeCounter}`;
		}
	}
	catch (error) {
		console.error(error);
	}
}
init();
const onStorageChange = () => {
	browser.storage.local.onChanged.removeListener(onStorageChange);
	init();
};


/*
 * Popup stuff.
 */
const pageStats = {
	tooltips: 0,
	requests: 0,
	rickRoll: 0
	
};
browser.runtime.onMessage.addListener(async (message) => {
	switch (message.command) {
		case "isDisabled":
			return disabledOnSite;
			break;
		case "getData":
			if (disabledOnSite.state)
				return null;
			let bucketsArrays = {};
			let bucketsData = {};
			for (let bucket in elementMap) {
				bucketsArrays[bucket] = [...elementMap[bucket]];
				bucketsData[bucket] = [];
				bucketsArrays[bucket].forEach(kvPair => {
					let idData = dataMap[bucket].get(kvPair[0]);
					bucketsData[bucket].push({
						id: kvPair[0],
						title: idData.title.substr(0, idData.title.indexOf("\n")),// Get just the video/playlist title, hopefully.
						count: kvPair[1].length,
						isRickRoll: idData.isRickRoll
					});
				});
			}
			return {
				pageStats: pageStats,
				bucketsData: bucketsData
			};
			break;
		case "gotoId":
			if (disabledOnSite.state)
				return null;
			let ele = elementMap[message.bucket].get(message.id)[message.index];
			if (document.body.contains(ele))
				ele.scrollIntoView();
			break;
	}
});

function setTitle(bucket, id, ele, text) {
	dataMap[bucket].get(id).title = text;
	if (options.displayMode === "tooltip")
		ele.title = text;
}

function checkIdStats(bucket, id) {
	for (let rickRoll of rickRollIds) {
		if (id === rickRoll) {
			incrementStat("rickRoll");
			dataMap[bucket].get(id).isRickRoll = true;
		}
	}
}
async function incrementStat(stat, num = 1) {
	pageStats[stat] += num;
	if (options.badgeEnable) {
		let statValue = pageStats[["rickRoll", "tooltips", "requests"][options.badgeCount]];
		if (statValue > 0) {
			await browser.runtime.sendMessage({
				command: "updateBadge",
				num: statValue,
				badgeColor: options.badgeColor
			});
		}
	}
	await browser.runtime.sendMessage({
		command: "updateStat",
		stat: stat,
		num: num,
		statsEnable: options.statsEnable// Popup requires updateStat messages, but the background script can safely ignore them if statsEnable=false.
	});
}

/*
 * Check for changes in the DOM structure and updates the tooltip on any added link.
 */
// This must be set here and reset at the end of the MutationObserver, otherwise it resets on multiple changes.
// For some reason, the top of the callback above the changes.forEach() loop is executed for every change. I have no idea why.
var newValidLinksBucket = {videos: [], playlists: []};
var observer = new MutationObserver((changes) => {
	changes.forEach(change => {
		change.addedNodes.forEach(node => {
			if (!(node instanceof Element)) {
				return;
			}
			let aElements = [];
			aElements = node.getAttribute("href")?.includes("youtu") ? [node] : node.querySelectorAll("a[href*=youtu]");
			let validLinksBucket = getElementsWithValidLinks(aElements);
			for (let bucket in validLinksBucket) {
				for (let link of validLinksBucket[bucket]) {
					if (!(link in newValidLinksBucket[bucket])) {
						newValidLinksBucket[bucket].push(link);
					}
				}
			}
		});
		change.removedNodes.forEach(node => {
			if (!(node instanceof Element)) {
				return;
			}
			let aElements = [];
			aElements = node.getAttribute("href")?.includes("youtu") ? [node] : node.querySelectorAll("a[href*=youtu]");
			let validLinksBucket = getElementsWithValidLinks(aElements);
			for (let bucket in validLinksBucket) {
				for (let link of validLinksBucket[bucket]) {
					let id = regexs[bucket].exec(decodeURIComponent(link.href))[1];
					let filteredEleArray = elementMap[bucket].get(id).filter(ele => ele !== link);
					if (filteredEleArray.length > 0) {
						elementMap[bucket].set(id, filteredEleArray);
					} else {
						elementMap[bucket].delete(id);
					}
				}
			}
		});
	});
	let lengthFlag = false;
	for (let bucket in newValidLinksBucket) {
		if (newValidLinksBucket[bucket].length > 0) {
			lengthFlag = true;
		}
	}
	if (lengthFlag) {
		let linkMapBuckets = getLinkMap(newValidLinksBucket);
		setNewLinks(linkMapBuckets);
	}
	newValidLinksBucket = {videos: [], playlists: []};
});

/*
 * Return a list of anchor elements with valid youtube references.
 */
function getElementsWithValidLinks(anchorElements) {
	let elementBuckets = {videos: [], playlists: []};
	for (let ele of anchorElements) {
		let url = decodeURIComponent(ele.href);
		if (options.videosEnable && regexs.videos.test(url)) {
			elementBuckets.videos.push(ele);
		} else if (options.playlistsEnable && regexs.playlists.test(url)) {
			elementBuckets.playlists.push(ele);
		}
	}
	return elementBuckets;
}

/*
 * Maps each youtube link id with the elements referencing it.
 */
function getLinkMap(linkBuckets) {
	let linkMapBuckets = {videos: new Map(), playlists: new Map()};
	for (let bucket in linkBuckets) {
		for (let link of linkBuckets[bucket]) {
			let url = decodeURIComponent(link.href);
			let id = regexs[bucket].exec(url)[1];
			if (!linkMapBuckets[bucket].has(id))
				linkMapBuckets[bucket].set(id, [link]);
			else
				linkMapBuckets[bucket].get(id).push(link);
		}
	}
	return linkMapBuckets;
}

const currentHoverNotification = {
	bucket: "",
	key: ""
};
var notificationTimeout;
function hoverLink(bucket, id, event) {
	let idData = dataMap[bucket].get(id);
	// Current element is not loaded. Check the first element associated with the same id.
	switch (idData.state) {
		case 0:
			// Not loaded. Make request for this id.
			idData.state = 1;
			idData.title = `Loading ${bucket.slice(0, -1)} info...`;
			setTitle(bucket, id, event.target, idData.title);
			loadTooltipsHover(bucket, id);
			break;
		case 1:
			// Still loading. Copy tooltip.
			setTitle(bucket, id, event.target, idData.title);
			break;
		case 2:
			// Loaded. Copy tooltip.
			setTitle(bucket, id, event.target, idData.title);
			incrementStat("tooltips");
			break;
	}
}

async function showNotification(bucket, id) {
	currentHoverNotification.bucket = bucket;
	currentHoverNotification.id = id;
	clearTimeout(notificationTimeout);
	notificationTimeout = setTimeout(async () => {
		try {
			await browser.runtime.sendMessage({
				command: "showNotification", info: dataMap[bucket].get(id).title
			});
		} catch(error) {
			console.error(error.message === "browser.notifications is undefined" ? "YouTooltip does not have notification permission." : error);
		}
	}, 500);
}
async function clearNotification() {
	currentHoverNotification.bucket = undefined;
	currentHoverNotification.id = undefined;
	clearTimeout(notificationTimeout);
	try {
		await browser.runtime.sendMessage({
			command: "clearNotification"
		});
	} catch(error) {
		// We already log this error in showNotification().
		if (error.message !== "browser.notifications is undefined")
			console.error(error);
	}
}
/*
 * Load tooltips for new links or set the tooltips of already mapped links with a new element.
 */
function setNewLinks(linkMapBuckets) {
	for (let bucket in linkMapBuckets) {
		for (let [key, value] of linkMapBuckets[bucket]) {
			if (elementMap[bucket].has(key)) {
				// Youtube video ID already mapped.
				let listOfElements = elementMap[bucket].get(key);
				for (let element of value) {
					if (!(element in listOfElements)) {
						listOfElements.push(element);
						if (options.operationMode === "auto") {// Only on auto mode, copy tooltip.
							setTitle(bucket, key, element, dataMap[bucket].get(key).title);
							incrementStat("tooltips");
						}
					}
				}
				linkMapBuckets[bucket].delete(key);
			} else {
				elementMap[bucket].set(key, value);
				dataMap[bucket].set(key, {
					title: "",
					state: 0,
					isRickRoll: false
				});
			}
			for (let element of value) {
				checkIdStats(bucket, key);
				if (options.operationMode === "hover") {
					// Only on hover mode, add mouseenter listener to the new link elements.
					element.addEventListener("mouseenter", (event) => {
						hoverLink(bucket, key, event);
					}, {
						once: true// Auto remove listener after firing.
					});
				}
				if (options.displayMode === "notification") {
					element.addEventListener("mouseenter", () => {
						showNotification(bucket, key);
					});
					if (options.notificationAutoDismiss)
						element.addEventListener("mouseleave", clearNotification);
				} else if (options.displayMode === "customTooltip") {
					element.addEventListener("mouseenter", (e) => {
						currentHoverNotification.bucket = bucket;
						currentHoverNotification.id = key;
						customTooltip.createTooltip(e.clientX, e.clientY, dataMap[bucket].get(key).title);
					});
					element.addEventListener("mouseleave", () => {
						currentHoverNotification.bucket = undefined;
						currentHoverNotification.id = undefined;
						customTooltip.removeTooltip();
					});
				}
			}
		}
	}
	if (options.operationMode === "auto") {
		// Only on auto mode, proceed to loadTooltips() if there is at least one link.
		let lengthFlag = false;
		for (let bucket in linkMapBuckets) {
			if (linkMapBuckets[bucket].size > 0)
				lengthFlag = true;
		}
		if (lengthFlag)
			loadTooltips(linkMapBuckets);
	}
}

/*
 * Sets the tooltips of each Youtube link in each map of elements in each bucket.
 */
async function loadTooltips(linkMapBuckets) {
	function setTooltips(bucket, key, mapValues, text, state, increStat) {
		let idData = dataMap[bucket].get(key);
		idData.state = state;
		idData.title = text;
		for (let ele of mapValues) {
			setTitle(bucket, key, ele, text);
		}
		if (increStat)
			incrementStat("tooltips", mapValues.length);
	}
	for (let bucket in linkMapBuckets) {
		for (let [key, value] of linkMapBuckets[bucket]) {
			setTooltips(bucket, key, value, `Loading ${bucket.slice(0, -1)} info...`, 1, false);
		}
		// The youtube api can only take a maximum 50 ids at a time, so they are split.
		let splitBucketArray = [];
		let bucketArray = Array.from(linkMapBuckets[bucket].entries());
		while (bucketArray.length > 0) {
			splitBucketArray.push(new Map(bucketArray.splice(0, 49)));
		}
		for (let linkMap of splitBucketArray) {
			let data = await getYTInfo(Array.from(linkMap.keys()).join(), bucket);
			
			for (let [key, value] of linkMap) {
				if (data === undefined) {
					setTooltips(bucket, key, value, `Could not get ${bucket.slice(0, -1)} info:\nResponse data is undefined.`, 2, true);
				} else if (data.items !== undefined) {
					let eleData = data.items.find(({id}) => id === key);
					if (eleData !== undefined) {
						// Builds the tooltip from the returned data
						let tooltip;
						switch (bucket) {
							case "videos":
								tooltip = [
									eleData.snippet.title,
									options.videosDurationEnable ? formatDuration(eleData.contentDetails.duration, options.videosDurationFormat) : "",
									options.videosPublishedEnable ? formatPublishedDate(eleData.snippet.publishedAt, options.videosPublishedFormat) : "",
									options.videosViewcountEnable ? formatNumber(eleData.statistics.viewCount, options.videosViewcountFormat, "views") : "",
									options.videosLikesEnable ? formatNumber(eleData.statistics.likeCount, options.videosLikesFormat, "likes") : "",
									options.videosChannelEnable ? eleData.snippet.channelTitle : ""
								];
								break;
							case "playlists":
								tooltip = [
									eleData.snippet.title,
									options.playlistsPublishedEnable ? formatPublishedDate(eleData.snippet.publishedAt, options.playlistsPublishedFormat) : "",
									options.playlistsPrivacyEnable ? eleData.status.privacyStatus : "",
									options.playlistsVideoCountEnable ? formatNumber(eleData.contentDetails.itemCount, options.playlistsVideoCountFormat, "videos") : "",
									options.playlistsChannelEnable ? eleData.snippet.channelTitle : ""
								];
								break;
						}
						tooltip = tooltip.filter(Boolean).join("\n");
						setTooltips(bucket, key, value, tooltip, 2, true);
					} else {
						setTooltips(bucket, key, value, `Could not get ${bucket.slice(0, -1)} info:\n${bucket.charAt(0).toUpperCase() + bucket.slice(1, -1)} not found`, 2, true);
					}
				} else if (data.error !== undefined) {
					if (data.error.message !== undefined) {
						// Regex filters out wierd link tags that really shouldn't be in an error message.
						setTooltips(bucket, key, value, `Could not get ${bucket.slice(0, -1)} info:\n${data.error.message.replace(/<\/?[^>]+(>|$)/g, "")}`, 2, true);
					} else {
						setTooltips(bucket, key, value, `Could not get ${bucket.slice(0, -1)} info:\n${data.error}`, 2, true);
					}
				}
			}
		}
	}
}

/*
 * Sets the tooltips of each Youtube link for one id.
 * Note: This function is the hover mode variant.
 */
async function loadTooltipsHover(bucket, key) {
	function setTooltips(text) {
		let mapValues = elementMap[bucket].get(key);
		let idData = dataMap[bucket].get(key);
		idData.state = 2;
		for (let ele of mapValues) {
			setTitle(bucket, key, ele, text);
		}
		if (options.operationMode === "hover" && currentHoverNotification.id === key) {
			if (options.displayMode === "notification")
				showNotification(bucket, key);
			else if (options.displayMode === "customTooltip")
				customTooltip.updateText(idData.title);
		}
		incrementStat("tooltips", mapValues.length);
	}
	let data = await getYTInfo(key, bucket);
	if (data === undefined) {
		setTooltips(`Could not get ${bucket.slice(0, -1)} info:\nResponse data is undefined.`);
	} else if (data.error !== undefined) {
		if (data.error.message !== undefined) {
			// Regex filters out wierd link tags that really shouldn't be in an error message.
			setTooltips(`Could not get ${bucket.slice(0, -1)} info:\n${data.error.message.replace(/<\/?[^>]+(>|$)/g, "")}`);
		} else {
			if (data.error === "Invalid parameter provided, unknown service")
				setTooltips(`Could not get ${bucket.slice(0, -1)} info:\n${bucket.charAt(0).toUpperCase() + bucket.slice(1, -1)} not found`);
			else
				setTooltips(`Could not get ${bucket.slice(0, -1)} info:\n${data.error}`);
		}
	} else if (options.apiService === "invidious") {
		if (!Object.entries(data).length) {
			setTooltips(`Could not get ${bucket.slice(0, -1)} info:\n${bucket.charAt(0).toUpperCase() + bucket.slice(1, -1)} not found`);
		} else {
			let tooltip;
			switch (bucket) {
				case "videos":
					tooltip = [
						data.title,
						options.videosDurationEnable ? formatDuration(data.lengthSeconds, options.videosDurationFormat) : "",
						options.videosPublishedEnableInvidious ? formatPublishedDate(data.published, options.videosPublishedFormatInvidious) : "",
						options.videosViewcountEnable ? formatNumber(data.viewCount, options.videosViewcountFormat, "views") : "",
						options.videosLikesEnable ? formatNumber(data.likeCount, options.videosLikesFormat, "likes") : "",
						options.videosChannelEnable ? data.author : ""
					];
					break;
				case "playlists":
					tooltip = [
						data.title,
						options.playlistsUpdatedEnableInvidious ? formatPublishedDate(data.updated, options.playlistsUpdatedFormatInvidious) : "",
						options.playlistsPrivacyEnable ? (data.isListed ? "listed" : "unlisted") : "",
						options.playlistsVideoCountEnable ? formatNumber(data.videoCount, options.playlistsVideoCountFormat, "videos") : "",
						options.playlistsChannelEnable ? data.author : ""
					];
					break;
			}
			tooltip = tooltip.filter(Boolean).join("\n");
			setTooltips(tooltip);
		}
	} else if (options.apiService === "piped") {
		let tooltip;
		switch (bucket) {
			case "videos":
				tooltip = [
					data.title,
					options.videosDurationEnable ? formatDuration(data.duration, options.videosDurationFormat) : "",
					options.videosPublishedEnableInvidious ? formatPublishedDate(data.uploadDate, options.videosPublishedFormatInvidious) : "",
					options.videosViewcountEnable ? formatNumber(data.views, options.videosViewcountFormat, "views") : "",
					options.videosLikesEnable ? formatNumber(data.likes, options.videosLikesFormat, "likes") : "",
					options.videosChannelEnable ? data.uploader : ""
				];
				break;
			case "playlists":
				tooltip = [
					data.name,
					options.playlistsVideoCountEnable ? formatNumber(data.videos, options.playlistsVideoCountFormat, "videos") : "",
					options.playlistsChannelEnable ? data.uploader : ""
				];
				break;
		}
		tooltip = tooltip.filter(Boolean).join("\n");
		setTooltips(tooltip);
	} else if (data.items !== undefined) {
		let eleData = data.items.find(({id}) => id === key);
		if (eleData !== undefined) {
			// Builds the tooltip from the returned data
			let tooltip;
			switch (bucket) {
				case "videos":
					tooltip = [
						eleData.snippet.title,
						options.videosDurationEnable ? formatDuration(eleData.contentDetails.duration, options.videosDurationFormat) : "",
						options.videosPublishedEnable ? formatPublishedDate(eleData.snippet.publishedAt, options.videosPublishedFormat) : "",
						options.videosViewcountEnable ? formatNumber(eleData.statistics.viewCount, options.videosViewcountFormat, "views") : "",
						options.videosLikesEnable ? formatNumber(eleData.statistics.likeCount, options.videosLikesFormat, "likes") : "",
						options.videosChannelEnable ? eleData.snippet.channelTitle : ""
					];
					break;
				case "playlists":
					tooltip = [
						eleData.snippet.title,
						options.playlistsPublishedEnable ? formatPublishedDate(eleData.snippet.publishedAt, options.playlistsPublishedFormat) : "",
						options.playlistsPrivacyEnable ? eleData.status.privacyStatus : "",
						options.playlistsVideoCountEnable ? formatNumber(eleData.contentDetails.itemCount, options.playlistsVideoCountFormat, "videos") : "",
						options.playlistsChannelEnable ? eleData.snippet.channelTitle : ""
					];
					break;
			}
			tooltip = tooltip.filter(Boolean).join("\n");
			setTooltips(tooltip);
		} else {
			setTooltips(`Could not get ${bucket.slice(0, -1)} info:\n${bucket.charAt(0).toUpperCase() + bucket.slice(1, -1)} not found`);
		}
	} else if (!Object.entries(data).length) {
		setTooltips(`Could not get ${bucket.slice(0, -1)} info:\nResponse data is empty.`);
	}
}

/*
 * Requests and returns data from the youtube API.
 */
async function getYTInfo(ids, bucket) {
	// Only request as much info as our options instruct us.
	let part;
	let fields;
	let address;
	if (options.operationMode === "auto" || options.apiService === "google") {
		switch (bucket) {
			case "videos":
				part = [
					"snippet",
					options.videosDurationEnable ? "contentDetails" : "",
					options.videosViewcountEnable || options.videosLikesEnable ? "statistics" : ""
				];
				fields = [
					"id",
					"snippet/title",
					options.videosPublishedEnable ? "snippet/publishedAt" : "",
					options.videosDurationEnable ? "contentDetails/duration" : "",
					options.videosViewcountEnable ? "statistics/viewCount" : "",
					options.videosLikesEnable ? "statistics/likeCount" : "",
					options.videosChannelEnable ? "snippet/channelTitle" : ""
				];
				break;
			case "playlists":
				part = [
					"snippet",
					options.playlistsPrivacyEnable ? "status" : "",
					options.playlistsVideoCountEnable ? "contentDetails" : ""
				];
				fields = [
					"id",
					"snippet/title",
					options.playlistsPublishedEnable ? "snippet/publishedAt" : "",
					options.playlistsChannelEnable ? "snippet/channelTitle" : "",
					options.playlistsPrivacyEnable ? "status/privacyStatus" : "",
					options.playlistsVideoCountEnable ? "contentDetails/itemCount" : ""
				];
				break;
		}
		part = part.filter(Boolean).join(",");
		fields = fields.filter(Boolean).join(",");
		
		address = "https://www.googleapis.com/youtube/v3/" + bucket +
		"?key=" + (options.keyCustom === "" ? keyDefault : options.keyCustom) +
		"&id=" + ids + 
		"&part=" + part + 
		"&fields=items(" + fields + ")" +
		(bucket === "playlists" ? "&maxResults=50" : "");
	} else if (options.apiService === "invidious") {
		if (options.invidiousCustomInstance === "" && !options.invidiousDefaultInstances.length)
			return {error: "No Invidious instance selected."};
		switch (bucket) {
			case "videos":
				fields = [
					"videoId",
					"title",
					options.videosPublishedEnableInvidious ? "published" : "",
					options.videosDurationEnable ? "lengthSeconds" : "",
					options.videosViewcountEnable ? "viewCount" : "",
					options.videosLikesEnable ? "likeCount" : "",
					options.videosChannelEnable ? "author" : ""
				];
				break;
			case "playlists":
				fields = [
					"playlistId",
					"title",
					options.playlistsUpdatedEnableInvidious ? "updated" : "",
					options.playlistsChannelEnable ? "author" : "",
					options.playlistsPrivacyEnable ? "isListed" : "",
					options.playlistsVideoCountEnable ? "videoCount" : ""
				];
				break;
		}
		fields = fields.filter(Boolean).join(",");
		
		address = "https://" + (options.invidiousCustomInstance === "" ? options.invidiousDefaultInstances[options.invidiousDefaultInstance].domain : options.invidiousCustomInstance) + 
		"/api/v1/" + bucket +
		"/" + ids + 
		"?fields=" + fields;
	} else if (options.apiService === "piped") {
		if (options.pipedCustomInstance === "" && !options.pipedDefaultInstances.length)
			return {error: "No Piped instance selected."};
		address = (options.pipedCustomInstance === "" ? options.pipedDefaultInstances[options.pipedDefaultInstance].domain : options.pipedCustomInstance) + 
		"/" + (bucket === "videos" ? "streams" : bucket) +
		"/" + ids;
	}
	
	incrementStat("requests");
	let requestTimeout = false;// Connection timeout detector. Used to distinguish NetworkError errors.
	setTimeout(() => {
		requestTimeout = true;
	}, 1000);
	let response;
	try {
		response = await browser.runtime.sendMessage({
			command: "fetch",
			address: address
		});
		if (response instanceof Error)
			throw response;
		if (!response.ok)
			throw `Response not ok: ${response.status} ${response.statusText}`;
		return response.body;
	} catch(error) {
		let addressUrl = new URL(address);
		if (addressUrl.searchParams.get("key") !== null)
			addressUrl.searchParams.set("key", "APIKEY");// Don't show my (or the user's) api key in the error message.
		console.error(`${error} | Bucket: ${bucket} | API: ${options.apiService} | URL: ${decodeURIComponent(addressUrl.href)}`);
		if ((requestTimeout && error.message === "NetworkError when attempting to fetch resource.") || error.message?.includes("Could not establish connection"))
			return {error: "Connection timed out."};
		else if (error.message === "NetworkError when attempting to fetch resource.")
			return {error: "Could not send request. Check your internet connection."};
		else if (response.status > 499 && response.status < 600)
			return {error: `Server error: ${response.status} ${response.statusText}`};
		else if (response.status > 399 && response.status < 500)
			return response.body;
	}
}

/*
 * Returns a formatted duration.
 */
function formatDuration(duration, opt) {
	let matches;
	if (duration === "P0D" || duration === 0)
		return "Live stream";
	// Check if duration is in ISO 8601 format or just combined seconds.
	if (/PT/.test(duration)) {
		switch (opt) {
			case 0:
				matches = duration.match(/PT(?:(\d+)H)*(?:(\d+)M)?(?:(\d+)S)?/);
				matches.shift();
				matches.forEach((match, index) => {
					matches[index] = (match === undefined) ? "00" : match.padStart(2, "0");
				});
				return matches.join(":");
				break;
			case 1:
				matches = duration.match(/\d+[HMS]/g);
				return matches.join(" ").toLowerCase();
		}
	} else {
		switch (opt) {
			case 0:
				return new Date(duration * 1000).toISOString().substr(11, 8);
				break;
			case 1:
				matches = new Date(duration * 1000).toISOString().substr(11, 8);
				matches = matches.split(":");
				matches.forEach((match, index) => {
					matches[index] = match === "00" ? "" : parseInt(match, 10) + ["h", "m", "s"][index];
				});
				return matches.filter(Boolean).join(" ");
		}
	}
}

const to12HourDateTime = new Intl.DateTimeFormat("default", {
	weekday: "short",
	month: "short",
	day: "numeric",
	year: "numeric",
	hour: "numeric",
	minute: "numeric",
	second: "numeric",
	hour12: true
});
const to24HourDateTime = new Intl.DateTimeFormat("default", {
	weekday: "short",
	month: "short",
	day: "numeric",
	year: "numeric",
	hour: "numeric",
	minute: "numeric",
	second: "numeric",
	hour12: false
});
const toGMTDate = new Intl.DateTimeFormat("default", {
	weekday: "short",
	month: "short",
	day: "numeric",
	year: "numeric",
	timeZone: "GMT"
});
const timeAgo = {
	formatter: new Intl.RelativeTimeFormat("en-us", {numeric: "always"}),
	DIVISIONS: [
		{amount: 60, name: "seconds"},
		{amount: 60, name: "minutes"},
		{amount: 24, name: "hours"},
		{amount: 7, name: "days"},
		{amount: 4.34524, name: "weeks"},
		{amount: 12, name: "months"},
		{amount: Number.POSITIVE_INFINITY, name: "years"}
	],
	/*
	 * Formats a Date object into a "time ago" string.
	 */
	format: function(date) {
		let duration = (date - new Date()) / 1000;
		for (let i = 0; i <= this.DIVISIONS.length; i++) {
			if (Math.abs(duration) < this.DIVISIONS[i].amount)
				return this.formatter.format(Math.round(duration), this.DIVISIONS[i].name);
			duration /= this.DIVISIONS[i].amount;
		}
	}
};
/*
 * Returns a locale-aware formatted date string.
 */
function formatPublishedDate(dateString, opt) {
	let dateObject = new Date(isNaN(dateString) ? dateString : dateString * 1000);
	if (options.apiService === "google") {
		switch (opt) {
			case 0:
				return to12HourDateTime.format(dateObject) + " Local time";
				break;
			case 1:
				return to24HourDateTime.format(dateObject) + " Local time";
				break;
			case 2:
				return dateObject.toGMTString();
				break;
			case 3:
				return timeAgo.format(dateObject);
				break;
		}
	} else {
		switch (opt) {
			case 0:
				return toGMTDate.format(dateObject) + " GMT";
				break;
			case 1:
				return timeAgo.format(dateObject);
				break;
		}
	}
}

const toCompactShortNumber = new Intl.NumberFormat("default", {
	notation: "compact",
	compactDisplay: "short"
});
const toLongNumber = new Intl.NumberFormat("default");
/*
 * Returns a locale-aware formatted number.
 */
function formatNumber(num, opt, str) {
	switch (opt) {
		case 0:
			return toCompactShortNumber.format(num) + (str === undefined ? "" : " " + str);
			break;
		case 1:
			return toLongNumber.format(num) + (str === undefined ? "" : " " + str);
	}
}

/*
 * Creates a custom HTML tooltip.
 */
const customTooltip = {
	displayTimeout: null,
	xPos: null,
	yPos: null,
	createTooltip: function(xPos, yPos, text) {
		customTooltip.xPos = xPos;
		customTooltip.yPos = yPos;
		let tooltip = document.getElementById("youTooltip");
		if (tooltip !== null)
			customTooltip.removeTooltip();
		tooltip = document.createElement("div");
		tooltip.id = "youTooltip";
		tooltip.setAttribute("role", "tooltip");
		tooltip.style.cssText = "all: initial !important; display: none !important; position: fixed !important; z-index: 2147483647 !important; padding: 3px !important; max-width: 560px !important; width: max-content !important; border-radius: 4px !important; font-size: 12px !important; font-family: 'Segoe UI', system-ui, sans-serif !important; white-space: pre-wrap !important; pointer-events: none !important; background-color: #f9f9f9 !important; border: 1px solid #676767 !important; color: #000 !important;" + (window.matchMedia("(prefers-color-scheme: dark)").matches ? "background-color: #000 !important; border-color: #878787 !important; color: #fff !important;" : "") + customTooltipCSSImportant;
		tooltip.textContent = text;
		document.body.appendChild(tooltip);
		document.body.addEventListener("keydown", customTooltip.onEscapeKey);
		customTooltip.displayTimeout = setTimeout(() => {
			tooltip.style.display = "block";
			customTooltip.calculatePosition(xPos, yPos);
		}, 500);
		
	},
	updateText: function(text) {
		document.getElementById("youTooltip").textContent = text;
		customTooltip.calculatePosition(customTooltip.xPos, customTooltip.yPos);
	},
	onEscapeKey: function(e) {
		if (e.key === "Escape") {
			customTooltip.removeTooltip();
		}
	},
	removeTooltip: function() {
		document.getElementById("youTooltip")?.remove();
		document.body.removeEventListener("keydown", customTooltip.onEscapeKey);
		clearTimeout(customTooltip.displayTimeout);
	},
	calculatePosition: function(xPos, yPos) {
		let tooltip = document.getElementById("youTooltip");
		
		// Here be black magic.
		let boundingClientRect = tooltip.getBoundingClientRect();
		let styles = {
			top: "auto",
			left: "auto",
			width: "max-content",
			translate: ["0%", "0%"]
		};
		if ((((xPos + 5) - boundingClientRect.width) < 0) && (((xPos + 5) + boundingClientRect.width) > document.documentElement.clientWidth)) {
			// Too far left AND right.
			styles.width = "auto";
			styles.left = "0px";
		} else if (((xPos + 5) + boundingClientRect.width) > document.documentElement.clientWidth) {
			// Too far right.
			styles.translate[0] = "-100%";
			styles.left = xPos + "px";
		} else {
			// Default position: 5px to the right of cursor.
			styles.left = (xPos + 5) + "px";
		}
		if (((yPos - boundingClientRect.height) < 0) && ((yPos + boundingClientRect.height) > document.documentElement.clientHeight)) {
			styles.top = "0px";
		} else if ((yPos + boundingClientRect.height) > document.documentElement.clientHeight) {
			// Too far down.
			styles.translate[1] = "-100%";
			styles.top = yPos + "px";
		} else {
			// Default position: 15px below cursor.
			styles.top = (yPos + 15) + "px";
		}
		tooltip.style.cssText = tooltip.style.cssText + `top: ${styles.top} !important; left: ${styles.left} !important; width: ${styles.width} !important; transform: translate(${styles.translate.toString()}) !important;`;
	}
};
