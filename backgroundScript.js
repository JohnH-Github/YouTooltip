"use strict";

// If you intend to make your own fork of this extension (like I did), then follow
// the instructions at https://developers.google.com/youtube/registering_an_application
// and generate your own key(s).
const keyDefaultArray = [
	"AIzaSyD7KtWdS39ip3tPVzjZTXjgSCwlm1Lwxmg",
	"AIzaSyC1aOdfLB-hGSxqvC--ltdVR16Wf-UwjJg",
	"AIzaSyC6st7GgMdBwwc4ruhzwW1XN8Ib7YU_DBg"
];

const invidiousDefaultInstanceArray = [
	"inv.riverside.rocks",
	"vid.puffyan.us",
	"y.com.sb",
	"yt.artemislena.eu",
	"invidious.flokinet.to",
	"invidious.sethforprivacy.com",
	"invidious.tiekoetter.com",
	"inv.bp.projectsegfau.lt",
	"invidious.projectsegfau.lt",
	"inv.vern.cc",
	"invidious.nerdvpn.de",
	"invidious.slipfox.xyz"
];

const defaultOptions = {
	operationMode: "auto",
	
	apiService: "google",
	keyCustom: "",
	keyDefaultIndex: undefined,
	invidiousDefaultInstance: undefined,
	invidiousCustomInstance: "",
	
	displayMode: "tooltip",
	videosEnable: true,
	videosDurationEnable: true,
	videosDurationFormat: 0,
	videosPublishedEnable: true,
	videosPublishedFormat: 0,
	videosPublishedEnableInvidious: true,
	videosPublishedFormatInvidious: 0,
	videosViewcountEnable: false,
	videosViewcountFormat: 0,
	videosLikesEnable: false,
	videosLikesFormat: 0,
	videosChannelEnable: true,
	
	playlistsEnable: true,
	playlistsPublishedEnable: true,
	playlistsPublishedFormat: 0,
	playlistsUpdatedEnableInvidious: true,
	playlistsUpdatedFormatInvidious: 0,
	playlistsPrivacyEnable: false,
	playlistsVideoCountEnable: true,
	playlistsVideoCountFormat: 0,
	playlistsChannelEnable: true,
	
	statsEnable: true
};

const defaultStats = {
	tooltipsSession: 0,
	tooltipsTotal: 0,
	requestsSession: 0,
	requestsTotal: 0,
	rickRollSession: 0,
	rickRollTotal: 0
};
var stats = defaultStats;

async function setDefaultOptions() {
	let options = defaultOptions;
	options.keyDefaultIndex = Math.floor(Math.random() * keyDefaultArray.length);
	options.invidiousDefaultInstance = Math.floor(Math.random() * invidiousDefaultInstanceArray.length);
	return await browser.storage.local.set({options});
}

async function setDefaultStats() {
	return await browser.storage.local.set(defaultStats);
}

async function checkOptions(previousVersion, options) {
	let storageOptions = await browser.storage.local.get("options");
	if (options === undefined) {
		if (storageOptions.options === undefined) {
			await setDefaultOptions();
			storageOptions = await browser.storage.local.get("options");
		}
		options = storageOptions.options;
	}
	// Make sure that properties match.
	// Minimum browser versions for Object.hasOwn(): Firefox 92, Chromium 93.
	for (let prop in options) {
		if (!Object.hasOwn(defaultOptions, prop))
			delete options[prop];
	}
	for (let prop in defaultOptions) {
		if (!Object.hasOwn(options, prop)) {
			if (Object.hasOwn(storageOptions.options, prop))
				options[prop] = storageOptions.options[prop];
			else
				options[prop] = defaultOptions[prop];
		}
	}
	
	// Select a new default key if needed.
	if (keyDefaultArray[options.keyDefaultIndex] === undefined)
		options.keyDefaultIndex = Math.floor(Math.random() * keyDefaultArray.length);
	
	// Select a new default Invidious instance if needed.
	if (invidiousDefaultInstanceArray[options.invidiousDefaultInstance] === undefined)
		options.invidiousDefaultInstance = Math.floor(Math.random() * invidiousDefaultInstanceArray.length);
	
	return options;
}
async function checkStats(previousVersion, stats) {
	let storageStats = await browser.storage.local.get(Object.keys(defaultStats));
	if (stats === undefined)
		stats = storageStats;
	for (let prop in defaultStats) {
		if (!Object.hasOwn(stats, prop)) {
			if (Object.hasOwn(storageStats, prop))
				stats[prop] = storageStats[prop];
			else
				stats[prop] = defaultStats[prop];
		}
	}
	
	return stats;
}

browser.runtime.onInstalled.addListener(async (details) => {
	if (details.reason === "install") {
		await setDefaultOptions();
		await setDefaultStats();
		await browser.runtime.openOptionsPage();
	} else if (details.reason === "update") {
		let options = await checkOptions(details.previousVersion);
		console.log("OPTIONS: ", options)
		let stats = await checkStats(details.previousVersion);
		await browser.storage.local.set({options});
		await browser.storage.local.set(stats);
		// browser.tabs.create({
			// url: "options/options.html#releaseNotes"
		// });
	}
});

browser.runtime.onStartup.addListener(async () => {
	let storageStats = await browser.storage.local.get(["tooltipsSession", "requestsSession", "rickRollSession"]);
	storageStats.tooltipsSession = 0;
	storageStats.requestsSession = 0;
	storageStats.rickRollSession = 0;
	await browser.storage.local.set(storageStats);
});

// Small collection of common rickrolls for statistics.
const rickRollIds = [
	"dQw4w9WgXcQ",
	"LLFhKaqnWwk",
	"oHg5SJYRHA0",
	"xvFZjo5PgG0",
	"iik25wqIuFo",
	"ub82Xb1C8os",
	"eBGIQ7ZuuiU"
]
function checkIdStats(id) {
	if (options.statsEnable) {
		for (let rickRoll of rickRollIds) {
			if (id === rickRoll) {
				incrementStat("rickRollSession");
				incrementStat("rickRollTotal");
			}
		}
	}
}
var statsUpdating = false;
function getStatToUpdate() {
	for (let stat in stats) {
		if (stats[stat] > 0)
			return stat;
	}
}
async function incrementStat(stat, num = 1) {
	stats[stat] += num;
	if (!statsUpdating) {
		statsUpdating = true;
		let statToUpdate = getStatToUpdate();
		while (statToUpdate !== undefined) {
			let statStorage = await browser.storage.local.get(statToUpdate);
			let statToUpdateValue = stats[statToUpdate];
			stats[statToUpdate] = 0;
			statStorage[statToUpdate] += statToUpdateValue;
			await browser.storage.local.set(statStorage);
			statToUpdate = getStatToUpdate();
		}
		statsUpdating = false;
	}
}

browser.runtime.onMessage.addListener(async (message) => {
	switch (message.command) {
		case "reset":
			if (message.reset === "everything") {
				let removeStorage = await browser.storage.local.clear();
				let settingDefaultOptions = await setDefaultOptions();
				let settingDefaultStats = await setDefaultStats();
				return removeStorage === undefined && settingDefaultOptions === undefined && settingDefaultStats === undefined;// Undefined means success, so return true.
			} else if (message.reset === "options") {
				let removeStorageOptions = await browser.storage.local.remove("options");
				let settingDefaultOptions = await setDefaultOptions();
				return removeStorageOptions === undefined && settingDefaultOptions === undefined;// Undefined means success, so return true.
			} else {
				return undefined;
			}
			break;
		case "checkImport":
			let checkedOptions = await checkOptions(message.version, message.optionsObj);
			let checkedStats = await checkStats(message.version, message.statsObj);
			return {
				checkedOptions,
				checkedStats
			}
			break;
		case "resetStats":
			let removeStorageStats = await browser.storage.local.remove(Object.keys(defaultStats));
			let setDefaultStatsResult = await setDefaultStats();
			return removeStorageStats === undefined && setDefaultStatsResult === undefined;// Undefined means success, so return true.
			break;
		case "updateStat":
			await incrementStat(message.stat, message.num);
			break;
		case "getKeyDefault":
			if (message.index === undefined) {
				let storageOptions = await browser.storage.local.get("options");
				return keyDefaultArray[storageOptions.options.keyDefaultIndex];
			} else {
				return keyDefaultArray[message.index];
			}
			break;
		case "getInvidiousDefaultInstance":
			if (message.index === undefined) {
				let storageOptions = await browser.storage.local.get("invidiousDefaultInstance");
				return invidiousDefaultInstanceArray[storageOptions.options.invidiousDefaultInstance];
			} else {
				return invidiousDefaultInstanceArray[message.index];
			}
			break;
		case "showNotification":
			return await browser.notifications.create("youtooltip", {
				type: "basic",
				iconUrl: browser.runtime.getURL("icons/icon.svg"),
				title: "YouTooltip",
				message: message.info,
			});
			break;
		case "clearNotification":
			return await browser.notifications.clear("youtooltip");
			break;
		case "hasPermission":
			return await browser.permissions.contains(message.permissions);
			break;
	}
});
