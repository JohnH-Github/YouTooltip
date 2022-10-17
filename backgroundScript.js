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
	
	statsEnable: true,
	
	blacklist: []
};

const defaultStats = {
	tooltipsSession: 0,
	tooltipsTotal: 0,
	requestsSession: 0,
	requestsTotal: 0,
	rickRollSession: 0,
	rickRollTotal: 0
};
var updateStatsTracker = defaultStats;

async function setDefaultOptions() {
	let options = defaultOptions;
	options.keyDefaultIndex = Math.floor(Math.random() * keyDefaultArray.length);
	options.invidiousDefaultInstance = Math.floor(Math.random() * invidiousDefaultInstanceArray.length);
	return await browser.storage.local.set({options});
}

async function setDefaultStats() {
	return await browser.storage.local.set({stats: defaultStats});
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
	switch (previousVersion) {
		case "1.0.2":
			// Convert individual stats to properties in an object in storage.
			let oldStats = ["tooltipsSession", "tooltipsTotal", "requestsSession", "requestsTotal", "rickRollSession", "rickRollTotal"];
			let oldStorageStats = await browser.storage.local.get(oldStats);
			if (Object.keys(oldStorageStats).length > 0) {
				await browser.storage.local.set({stats: oldStorageStats});
				await browser.storage.local.remove(oldStats);
			}
			break;
	}
	
	let storageStats = await browser.storage.local.get("stats");
	
	if (stats === undefined) {
		if (storageStats.stats === undefined) {
			await setDefaultStats();
			storageStats = await browser.storage.local.get("stats");
		}
		stats = storageStats.stats;
	}
	
	for (let prop in stats) {
		if (!Object.hasOwn(defaultStats, prop))
			delete stats[prop];
	}
	for (let prop in defaultStats) {
		if (!Object.hasOwn(stats, prop)) {
			if (Object.hasOwn(storageStats.stats, prop))
				stats[prop] = storageStats.stats[prop];
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
		let stats = await checkStats(details.previousVersion);
		await browser.storage.local.set({options, stats});
		// browser.tabs.create({
			// url: "options/options.html#releaseNotes"
		// });
	}
});

browser.runtime.onStartup.addListener(async () => {
	let storageStats = await browser.storage.local.get("stats");
	storageStats.stats.tooltipsSession = 0;
	storageStats.stats.requestsSession = 0;
	storageStats.stats.rickRollSession = 0;
	await browser.storage.local.set(storageStats);
});

/*
 * Returns the first stat that has at least 1 to add.
 */
function getStatToUpdate() {
	for (let stat in updateStatsTracker) {
		if (updateStatsTracker[stat] > 0)
			return stat;
	}
}
var statsUpdating = false;
async function incrementStat(stat, num = 1) {
	updateStatsTracker[stat] += num;
	if (!statsUpdating) {
		statsUpdating = true;
		let statToUpdate = getStatToUpdate();
		while (statToUpdate !== undefined) {
			let statsStorage = await browser.storage.local.get("stats");
			let statToUpdateValue = updateStatsTracker[statToUpdate];
			updateStatsTracker[statToUpdate] = 0;
			statsStorage.stats[statToUpdate] += statToUpdateValue;
			await browser.storage.local.set(statsStorage);
			statToUpdate = getStatToUpdate();
		}
		statsUpdating = false;
	}
}

browser.runtime.onMessage.addListener(async (message, sender) => {
	switch (message.command) {
		case "reset":
			if (message.reset === "everything") {
				await browser.storage.local.clear();
				await setDefaultOptions();
				await setDefaultStats();
			} else if (message.reset === "options") {
				await browser.storage.local.remove("options");
				await setDefaultOptions();
			}
			break;
		case "checkImport":
			let checkedOptions = await checkOptions(message.version, message.optionsObj);
			let checkedStats = await checkStats(message.version, message.statsObj);
			return {
				checkedOptions,
				checkedStats
			};
			break;
		case "resetStats":
			await browser.storage.local.remove("stats");
			await setDefaultStats();
			break;
		case "updateStat":
			// Only increment stats when we are in normal browsing, not private browsing.
			if (!sender.tab.incognito)
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
