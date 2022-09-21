"use strict";

var pageStats;
var bucketsData;

document.getElementById("openOptions").addEventListener("click", async () => {
	await browser.runtime.openOptionsPage();
	window.close();
});
document.getElementById("refresh").addEventListener("click", getStats);

function addListEle(bucket, datum, append = true) {
	let listEle = document.querySelector("#listEle").content.firstElementChild.cloneNode(true);
	listEle.dataset.id = datum.id;
	listEle.querySelector(".count").textContent = datum.count;
	let titleEle = listEle.querySelector(".title");
	if (datum.title === "") {
		titleEle.textContent = "<Unknown>";
		titleEle.classList.add("unknown");
	} else {
		titleEle.textContent = datum.title;
		titleEle.classList.remove("unknown");
	}
	listEle.querySelector(".link").href = "https://www.youtube.com/" + (bucket === "videos" ? "watch?v=" : "playlist?list=") + datum.id;
	if (append)
		document.querySelector(`.youtubeLinks .${bucket} .list`).appendChild(listEle);
	else
		return listEle;
}

function update(newPageStats, newBucketsData) {
	if (bucketsData === undefined) {
		// Just opened popup. Build lists.
		for (let bucket in newBucketsData) {
			document.querySelector(`.youtubeLinks .${bucket} .list`).replaceChildren();
			newBucketsData[bucket].forEach(datum => {
				addListEle(bucket, datum);
			});
		}
	} else {
		// Updating lists. No need to rebuild everything.
		// Note: Hover operation mode won't update until links are hovered. Not really a bug, but definitely feels a little odd.
		for (let bucket in newBucketsData) {
			newBucketsData[bucket].forEach(item => {
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
		}
	}
	let allStats = document.querySelectorAll(".statContainer .stat");
	allStats.forEach(statEle => {
		statEle.querySelector(".value").textContent = (newPageStats[statEle.dataset.stat]);
	});
	pageStats = newPageStats;
	bucketsData = newBucketsData;
}

function isValidUrl(url) {
	return url.startsWith("http:") || url.startsWith("https:") || url.startsWith("file:");
}

async function getStats() {
	let tabs = await browser.tabs.query({active: true, currentWindow: true});
	try {
		let newPageStats = await browser.tabs.sendMessage(tabs[0].id, {
			command: "getPageStats"
		});
		let newBucketsData = await browser.tabs.sendMessage(tabs[0].id, {
			command: "getBucketsData"
		});
		update(newPageStats, JSON.parse(newBucketsData));
	} catch(error) {
		if (error.message === "Could not establish connection. Receiving end does not exist.") {
			// Content script hasn't been injected yet. We'll wait until it messages the background script.
			browser.runtime.onMessage.addListener(onContentScriptActive);
		} else {
			console.error(error, error.message);
			let errorEle = document.getElementById("error");
			errorEle.classList.add("show");
			errorEle.textContent = error.message;
		}
	}
}

async function init() {
	if (window.browser !== undefined) {
		let tabs = await browser.tabs.query({active: true, currentWindow: true});
		if (isValidUrl(tabs[0].url)) {
			await getStats();
			browser.runtime.onMessage.addListener(messageHandler);
		} else {
			document.body.classList.add("privileged");
			document.getElementById("refresh").disabled = true;
		}
	}
	document.querySelector(".content").classList.add("show");
}
init();

const onContentScriptActive = () => {
	browser.runtime.onMessage.removeListener(onContentScriptActive);
	getStats();
};

function messageHandler(message) {
	// Update stats and links when stats are sent to the background script for recording.
	// Note: As stated above, hover mode won't trigger this until a link is hovered.
	if (message.command === "updateStat") {
		if (["tooltipsTotal", "requestsTotal", "rickRollTotal"].indexOf(message.stat) > -1)
			getStats();
	}
}
