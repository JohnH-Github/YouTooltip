"use strict";


const regexs = {
	videos: /(?:\.|\/)(?:youtube\.com\/watch\?.*v=|youtu\.be\/)([^\&\?]{5,})/,
	playlists: /(?:\.|\/)youtube\.com\/playlist\?list=([^\&\?]{5,})/
}

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

var options;
var keyDefault;
var onStorageChangeCounter = 0;
var blacklisted = false;

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
			if (options.displayMode === "notification") {
				let gotPermission = await browser.runtime.sendMessage({
					command: "hasPermission",
					permissions: {permissions: ["notifications"]}
				});
				if (!gotPermission) {
					options.displayMode = "tooltip";// Fall back to tooltips if we don't have the notification permission.
					console.warn("YouTooltip does not have notification permission. Falling back to tooltips.");
				}
			}
			
			// Check for blacklist after sending messages to make sure the popup receives them if it is listening.
			if (isBlacklisted(window.location)) {
				blacklisted = true;
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
		case "isBlacklisted":
			return blacklisted;
			break;
		case "getData":
			if (blacklisted)
				return null;
			let bucketsArrays = {};
			let bucketsData = {};
			for (let bucket in elementMap) {
				bucketsArrays[bucket] = [...elementMap[bucket]];
				bucketsData[bucket] = [];
				bucketsArrays[bucket].forEach(kvPair => {
					let title = getTitle(kvPair[1][0]);
					bucketsData[bucket].push({
						id: kvPair[0],
						title: title.substr(0, title.indexOf("\n")),// Get just the video/playlist title, hopefully.
						count: kvPair[1].length
					});
				});
			}
			return {
				pageStats: pageStats,
				bucketsData: bucketsData
			};
			break;
		case "gotoId":
			if (blacklisted)
				return null;
			let ele = elementMap[message.bucket].get(message.id)[message.index];
			if (document.body.contains(ele))
				ele.scrollIntoView();
			break;
	}
});

function getTitle(ele) {
	return options.displayMode === "tooltip" ? ele.title : ele.dataset.youtooltipTitle;
}
function setTitle(ele, text) {
	if (options.displayMode === "tooltip")
		ele.title = text;
	else
		ele.dataset.youtooltipTitle = text;
}

function checkIdStats(id) {
	for (let rickRoll of rickRollIds) {
		if (id === rickRoll)
			incrementStat("rickRoll");
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
var observer = new MutationObserver((changes) => {
	let newValidLinksBucket = {videos: [], playlists: []};
	changes.forEach(change => {
		change.addedNodes.forEach(node => {
			let aElements = [];
			aElements = node.tagName === "A" ? [node] : node.getElementsByTagName("a");
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
			let aElements = [];
			aElements = node.tagName === "A" ? [node] : node.getElementsByTagName("a");
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
function hoverLink(event) {
	let bucket = event.target.dataset.youtooltipBucket;
	let id = event.target.dataset.youtooltipId;
	let listOfElements = elementMap[bucket].get(id);
	if (event.target.dataset.youtooltipState !== "2") {
		// Current element is not loaded. Check the first element associated with the same id.
		switch (listOfElements[0].dataset.youtooltipState) {
			case "0":
				// Not loaded. Make request for this id.
				listOfElements[0].dataset.youtooltipState = 1;
				setTitle(listOfElements[0], `Loading ${bucket.slice(0, -1)} info...`);
				event.target.dataset.youtooltipState = 1;
				setTitle(event.target, getTitle(listOfElements[0]));
				loadTooltipsHover(bucket, id);
				break;
			case "1":
				// Still loading. Copy tooltip.
				event.target.dataset.youtooltipState = 1;
				setTitle(event.target, getTitle(listOfElements[0]));
				break;
			case "2":
				// Loaded. Copy tooltip.
				event.target.dataset.youtooltipState = 2;
				setTitle(event.target, getTitle(listOfElements[0]));
				incrementStat("tooltips");
				break;
		}
	}
}

async function showNotification(ele) {
	currentHoverNotification.bucket = ele.dataset.youtooltipBucket;
	currentHoverNotification.id = ele.dataset.youtooltipId;
	clearTimeout(notificationTimeout);
	notificationTimeout = setTimeout(async () => {
		try {
			await browser.runtime.sendMessage({
				command: "showNotification", info: ele.dataset.youtooltipTitle
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
							setTitle(element, getTitle(listOfElements[0]));
							incrementStat("tooltips");
						}
					}
				}
				linkMapBuckets[bucket].delete(key);
			} else {
				elementMap[bucket].set(key, value);
			}
			for (let element of value) {
				checkIdStats(key);
				if (options.operationMode === "hover") {
					// Only on hover mode, add dataset attributes and mouseenter listener to the new link elements.
					element.dataset.youtooltipBucket = bucket;
					element.dataset.youtooltipId = key;
					element.dataset.youtooltipState = 0;
					element.addEventListener("mouseenter", hoverLink, {
						once: true// Auto remove listener after firing.
					});
				}
				if (options.displayMode === "notification") {
					setTitle(element, "");
					element.addEventListener("mouseenter", (e) => {
						showNotification(e.target);
					});
					element.addEventListener("mouseleave", clearNotification);
				} else if (options.displayMode === "customTooltip") {
					setTitle(element, "");
					element.addEventListener("mouseenter", (e) => {
						currentHoverNotification.bucket = e.target.dataset.youtooltipBucket;
						currentHoverNotification.id = e.target.dataset.youtooltipId;
						customTooltip.createTooltip(e.clientX, e.clientY, e.target.dataset.youtooltipTitle);
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
	function setTooltips(mapValues, text) {
		for (let ele of mapValues) {
			setTitle(ele, text);
		}
		incrementStat("tooltips", mapValues.length);
	}
	for (let bucket in linkMapBuckets) {
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
					setTooltips(value, `Could not get ${bucket.slice(0, -1)} info:\nResponse data is undefined.`);
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
						setTooltips(value, tooltip);
					} else {
						setTooltips(value, `Could not get ${bucket.slice(0, -1)} info:\n${bucket.charAt(0).toUpperCase() + bucket.slice(1, -1)} not found`);
					}
				} else if (data.error !== undefined) {
					if (data.error.message !== undefined) {
						// Regex filters out wierd link tags that really shouldn't be in an error message.
						setTooltips(elementMap[bucket].get(key), `Could not get ${bucket.slice(0, -1)} info:\n${data.error.message.replace(/<\/?[^>]+(>|$)/g, "")}`);
					} else {
						setTooltips(elementMap[bucket].get(key), `Could not get ${bucket.slice(0, -1)} info:\n${data.error}`);
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
	function setTooltips(mapValues, text) {
		for (let ele of mapValues) {
			setTitle(ele, text);
			ele.dataset.youtooltipState = 2;
		}
		if (options.operationMode === "hover" && currentHoverNotification.id === key) {
			if (options.displayMode === "notification")
				showNotification(mapValues[0]);
			else if (options.displayMode === "customTooltip")
				customTooltip.updateText(mapValues[0].dataset.youtooltipTitle);
		}
		incrementStat("tooltips", mapValues.length);
	}
	let data = await getYTInfo(key, bucket);
	if (data === undefined) {
		setTooltips(elementMap[bucket].get(key), `Could not get ${bucket.slice(0, -1)} info:\nResponse data is undefined.`);
	} else if (data.error !== undefined) {
		if (data.error.message !== undefined) {
			// Regex filters out wierd link tags that really shouldn't be in an error message.
			setTooltips(elementMap[bucket].get(key), `Could not get ${bucket.slice(0, -1)} info:\n${data.error.message.replace(/<\/?[^>]+(>|$)/g, "")}`);
		} else {
			setTooltips(elementMap[bucket].get(key), `Could not get ${bucket.slice(0, -1)} info:\n${data.error}`);
		}
	} else if (options.apiService === "invidious") {
		if (!Object.entries(data).length) {
			setTooltips(elementMap[bucket].get(key), `Could not get ${bucket.slice(0, -1)} info:\n${bucket.charAt(0).toUpperCase() + bucket.slice(1, -1)} not found`);
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
			setTooltips(elementMap[bucket].get(key), tooltip);
		}
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
			setTooltips(elementMap[bucket].get(key), tooltip);
		} else {
			setTooltips(elementMap[bucket].get(key), `Could not get ${bucket.slice(0, -1)} info:\n${bucket.charAt(0).toUpperCase() + bucket.slice(1, -1)} not found`);
		}
	} else if (!Object.entries(data).length) {
		setTooltips(elementMap[bucket].get(key), `Could not get ${bucket.slice(0, -1)} info:\nResponse data is empty.`);
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
	} else {
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
	}
	
	incrementStat("requests");
	let abortController = new AbortController();
	const requestTimeout = setTimeout(() => {
		abortController.abort();// Abort request after 30 seconds if not complete.
	}, 30000);
	let response;
	try {
		response = await fetch(address, {signal: abortController.signal});
		clearTimeout(requestTimeout);
		if (!response.ok)
			throw `Response not ok: ${response.status} ${response.statusText}`;
		return await response.json();
	} catch(error) {
		clearTimeout(requestTimeout);
		let addressUrl = new URL(address);
		if (addressUrl.searchParams.get("key") !== null)
			addressUrl.searchParams.set("key", "APIKEY");// Don't show my (or the user's) api key in the error message.
		console.error(error, `Bucket: ${bucket}.`, `API: ${options.apiService}.`, `URL: ${decodeURIComponent(addressUrl.href)}`);
		if (error.message === "NetworkError when attempting to fetch resource.")
			return {error: "Could not send request. Check your internet connection."};
		else if (response.status > 499 && response.status < 600)
			return {error: `Server error: ${response.status} ${response.statusText}`};
		else if (response.status > 399 && response.status < 500) {
			return await response.json();
		}
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
		tooltip.setAttribute("style", "display: none; position: fixed; padding: 3px; max-width: 560px; width: max-content; border-radius: 4px; font-size: 12px; font-family: 'Segoe UI', system-ui, sans-serif; white-space: pre-wrap; pointer-events: none; background-color: #f9f9f9; border: 1px solid #676767; color: #000;" + (window.matchMedia("(prefers-color-scheme: dark)").matches ? "background-color: #000; border-color: #878787; color: #fff;" : "") + options.customTooltipCSS);
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
		document.getElementById("youTooltip").remove();
		document.body.removeEventListener("keydown", customTooltip.onEscapeKey);
		clearTimeout(customTooltip.displayTimeout);
	},
	calculatePosition: function(xPos, yPos) {
		let tooltip = document.getElementById("youTooltip");
		
		// Here be black magic.
		let boundingClientRect = tooltip.getBoundingClientRect();
		let translate = ["0%", "0%"];
		if ((((xPos + 5) - boundingClientRect.width) < 0) && (((xPos + 5) + boundingClientRect.width) > document.documentElement.clientWidth)) {
			// Too far left AND right.
			tooltip.style.width = "auto";
			tooltip.style.left = "0px";
		} else if (((xPos + 5) + boundingClientRect.width) > document.documentElement.clientWidth) {
			// Too far right.
			translate[0] = "-100%"
			tooltip.style.left = xPos + "px";
		} else {
			// Default position: 5px to the right of cursor.
			tooltip.style.left = (xPos + 5) + "px";
		}
		if (((yPos - boundingClientRect.height) < 0) && ((yPos + boundingClientRect.height) > document.documentElement.clientHeight)) {
			tooltip.style.top = "0px";
		} else if ((yPos + boundingClientRect.height) > document.documentElement.clientHeight) {
			// Too far down.
			translate[1] = "-100%"
			tooltip.style.top = yPos + "px";
		} else {
			// Default position: 15px below cursor.
			tooltip.style.top = (yPos + 15) + "px";
		}
		tooltip.style.transform = `translate(${translate.toString()})`;
	}
}
