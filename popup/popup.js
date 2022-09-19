"use strict";


document.getElementById("openOptions").addEventListener("click", async () => {
	await browser.runtime.openOptionsPage();
	window.close();
});
document.getElementById("refresh").addEventListener("click", getStats);

async function update(pageStats, bucketsData) {
	let allStats = document.querySelectorAll(".statContainer .stat");
	allStats.forEach(statEle => {
		statEle.querySelector(".value").textContent = (pageStats[statEle.dataset.stat]);
	});
	for (let bucket in bucketsData) {
		let bucketList = document.querySelector(`.list .${bucket} ul`);
		bucketList.replaceChildren();
		bucketsData[bucket].forEach(datum => {
			let listEle = document.createElement("li");
			let countEle = document.createElement("span");
			let titleEle = document.createElement("span");
			let linkEle = document.createElement("a");
			countEle.className = "count";
			countEle.textContent = datum.count;
			titleEle.className = "title";
			titleEle.textContent = datum.title;
			linkEle.className = "link";
			let linkIcon = document.querySelector("#featherExternalLink").content.cloneNode(true);
			linkEle.appendChild(linkIcon);
			linkEle.title = "Open link";
			linkEle.href = "https://www.youtube.com/" + (bucket === "videos" ? "watch?v=" : "playlist?list=") + datum.id;
			listEle.appendChild(countEle);
			listEle.appendChild(titleEle);
			listEle.appendChild(linkEle);
			bucketList.appendChild(listEle);
		});
	}
}

function isValidUrl(url) {
	return url.startsWith("http:") || url.startsWith("https:") || url.startsWith("file:");
}

async function getStats() {
	if (window.browser !== undefined) {
		let tabs = await browser.tabs.query({active: true, currentWindow: true});
		if (isValidUrl(tabs[0].url)) {
			try {
				let stats = await browser.tabs.sendMessage(tabs[0].id, {
					command: "getPageStats"
				});
				let bucketsData = await browser.tabs.sendMessage(tabs[0].id, {
					command: "getBucketsData"
				});
				await update(stats, JSON.parse(bucketsData));
			} catch(error) {
				console.error(error);
				let errorEle = document.getElementById("error");
				errorEle.classList.add("show");
				errorEle.textContent = error.message;
			}
		} else {
			document.body.classList.add("privileged");
			document.getElementById("refresh").disabled = true;
		}
	}
	document.querySelector(".content").classList.add("show");
}
getStats();
