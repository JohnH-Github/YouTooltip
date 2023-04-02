"use strict";

var thisTab;
var previouslyLoading = false;
var bucketsData;
const gotoIdCurrent = {
	id: "",
	index: -1
};
const toLongNumber = new Intl.NumberFormat("default");

window.addEventListener("error", (ErrorEvent) => {
	showError(ErrorEvent.error);
});

document.getElementById("openOptions").addEventListener("click", async () => {
	await browser.runtime.openOptionsPage();
	window.close();
});
document.getElementById("refresh").addEventListener("click", getStats);

function showError(error) {
	console.error(error, error.message);
	let errorEle = document.getElementById("error");
	errorEle.classList.add("show");
	errorEle.textContent = error.message;
}

async function gotoId(bucket, id, count) {
	if (gotoIdCurrent.id === id) {
		gotoIdCurrent.index = (gotoIdCurrent.index + 1) % count;
	} else {
		gotoIdCurrent.id = id;
		gotoIdCurrent.index = 0;
	}
	try {
		await browser.tabs.sendMessage(thisTab.id, {
			command: "gotoId",
			bucket: bucket,
			id: id,
			index: gotoIdCurrent.index
		});
	} catch(error) {
		showError(error);
	}
}
function pageStatusChange(tabId, changeInfo) {
	if (changeInfo.status === "complete" && previouslyLoading) {
		previouslyLoading = false;
		bucketsData = undefined;
		init();
	} else if (changeInfo.status === "loading") {
		previouslyLoading = true;
	}
}

function addListEle(bucket, item, append = true) {
	let listEle = document.querySelector("#listEle").content.firstElementChild.cloneNode(true);
	listEle.dataset.id = item.id;
	listEle.querySelector(".count").textContent = item.count;
	let titleEle = listEle.querySelector(".title");
	titleEle.textContent = item.title === "" ? "<Unknown>" : item.title;
	titleEle.classList.toggle("unknown", item.title === "");
	titleEle.addEventListener("click", () => {
		gotoId(bucket, item.id, item.count);
	});
	listEle.querySelector(".link").href = "https://www.youtube.com/" + (bucket === "videos" ? "watch?v=" : "playlist?list=") + item.id;
	if (item.isRickRoll)
		listEle.classList.add("rickRoll");
	if (append)
		document.querySelector(`.youtubeLinks .${bucket} .list`).appendChild(listEle);
	else
		return listEle;
}

function update(newPageStats, newBucketsData) {
	for (let bucket in newBucketsData) {
		let totalCount = 0;
		if (bucketsData === undefined) {
			// Just opened popup. Build lists.
			document.querySelector(`.youtubeLinks .${bucket} .list`).replaceChildren();
			newBucketsData[bucket].forEach(item => {
				totalCount += item.count;
				addListEle(bucket, item);
			});
		} else {
			// Updating lists. No need to rebuild everything.
			// Note: Hover operation mode won't update until links are hovered. Not really a bug, but definitely feels a little odd.
			newBucketsData[bucket].forEach(item => {
				totalCount += item.count;
				let findResult = bucketsData[bucket].find(({id}) => id === item.id);
				if (findResult === undefined) {
					// Add new item at the end.
					addListEle(bucket, item);
				} else if (item.count !== findResult.count || item.title !== findResult.title) {
					// Modify existing item.
					let newListEle = addListEle(bucket, item, false);
					let oldListEle = document.querySelector(`.youtubeLinks .${bucket} .list .item[data-id="${findResult.id}"]`);
					document.querySelector(`.youtubeLinks .${bucket} .list`).replaceChild(newListEle, oldListEle);
				}
			});
			bucketsData[bucket].forEach(item => {
				let findResult = newBucketsData[bucket].find(({id}) => id === item.id);
				if (findResult === undefined) {
					// Remove nonexisting item.
					document.querySelector(`.youtubeLinks .${bucket} .list .item[data-id="${item.id}"]`).remove();
				}
			});
		}
		document.querySelector(`.youtubeLinks .${bucket} summary .count`).textContent = totalCount;
	}
	let allStats = document.querySelectorAll(".statContainer .stat");
	allStats.forEach(statEle => {
		statEle.querySelector(".value").textContent = toLongNumber.format((newPageStats[statEle.dataset.stat]));
	});
	bucketsData = newBucketsData;
}

async function getStats() {
	try {
		let data = await browser.tabs.sendMessage(thisTab.id, {
			command: "getData"
		});
		update(data.pageStats, data.bucketsData);
	} catch(error) {
		showError(error);
	}
}

function isValidUrl(url) {
	if (url === undefined || url.startsWith("moz-extension:"))
		return {valid: false, reason: "browserPage"};
	let restrictedDomains = [
		"accounts-static.cdn.mozilla.net",
		"accounts.firefox.com",
		"addons.cdn.mozilla.net",
		"addons.mozilla.org",
		"api.accounts.firefox.com",
		"content.cdn.mozilla.net",
		"discovery.addons.mozilla.org",
		"install.mozilla.org",
		"oauth.accounts.firefox.com",
		"profile.accounts.firefox.com",
		"support.mozilla.org",
		"sync.services.mozilla.com"
	];
	let validProtocols = [
		"http:",
		"https:",
		"file:",
	];
	let URLobj = new URL(url);
	if (restrictedDomains.find(entry => entry === URLobj.hostname) !== undefined)
		return {valid: false, reason: "restrictedDomain"};
	else if (validProtocols.find(entry => entry === URLobj.protocol) === undefined)
		return {valid: false, reason: "badProtocol"};
	else
		return {valid: true, reason: ""};
}

async function init() {
	function showMain() {
		document.querySelector("#loading").classList.remove("show");
		document.querySelector("main").classList.add("show");
	}
	try {
		thisTab = (await browser.tabs.query({active: true, currentWindow: true}))[0];
		let validUrlObj = isValidUrl(thisTab.url);
		if (validUrlObj.valid) {
			let isDisabled = false;
			try {
				isDisabled = await browser.tabs.sendMessage(thisTab.id, {
					command: "isDisabled"
				});
				if (isDisabled.state) {
					document.body.classList.add("privileged");
					document.body.classList.add(isDisabled.reason);
				} else {
					await getStats();
					document.getElementById("refresh").disabled = false;
					browser.runtime.onMessage.addListener(messageHandler);
					browser.tabs.onUpdated.addListener(pageStatusChange, {
						tabId: thisTab.id,
						windowId: browser.windows.WINDOW_ID_CURRENT,
						properties: ["status"]// Listen for this page loading again.
					});
				}
				showMain();
			} catch(error) {
				if (error.message === "Could not establish connection. Receiving end does not exist.") {
					// Content script hasn't been injected yet. We'll wait until it messages the background script.
					browser.runtime.onMessage.addListener(onContentScriptActive);
				} else {
					showError(error);
				}
			}
		} else {
			document.body.classList.add("privileged");
			document.body.classList.add(validUrlObj.reason);
			showMain();
		}
	} catch (error) {
		if (error.name === "ReferenceError" && error.message.includes("browser"))
			showMain();
		else
			showError(error);
	}
}
init();

const onContentScriptActive = () => {
	browser.runtime.onMessage.removeListener(onContentScriptActive);
	init();
};

function messageHandler(message) {
	// Update stats and links when stats are sent to the background script for recording.
	// Note: As stated above, hover mode won't trigger this until a link is hovered.
	if (message.command === "updateStat")
		getStats();
}
