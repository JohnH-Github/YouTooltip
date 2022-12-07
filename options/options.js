"use strict";


document.getElementById("sidebarToggle").addEventListener('click', () => {
	let sidebar = document.querySelector(".sidebar");
	if (sidebar.classList.contains("show"))
		sidebar.classList.remove("show");
	else
		sidebar.classList.add("show");
});

async function updateNotificationPermission() {
	let notificationPermission = document.getElementById("notificationPermission");
	if (await browser.permissions.contains({permissions: ["notifications"]})) {
		notificationPermission.parentElement.classList.add("granted");
		notificationPermission.disabled = true;
		notificationPermission.classList.add("stayDisabled");
	} else {
		notificationPermission.parentElement.classList.remove("granted");
		notificationPermission.disabled = false;
	}
}
document.getElementById("notificationPermission").addEventListener('click', async () => {
	let permissionRequest = await browser.permissions.request({
		permissions: ["notifications"]
	});
	if (permissionRequest)
		updateNotificationPermission();
});

document.getElementById("resetOptionsButton").addEventListener('click', async () => {
	if (await showConfirmDialog("Reset options", "All options will be reset, but statistics will remain.\nReset options?")) {
		await browser.runtime.sendMessage({command: "reset", reset:"options"});
		await saveAndRestoreOptions("restore");
	}
});
document.getElementById("resetEverythingButton").addEventListener('click', async () => {
	if (await showConfirmDialog("Reset everything", "ALL options and statistics will be reset.\nReset everything?")) {
		await browser.runtime.sendMessage({command: "reset", reset:"everything"});
		await saveAndRestoreOptions("restore");
	}
});

function changeOperationMode() {
	let apiServiceGoogle = document.getElementsByName("apiService")[0];
	let apiServiceInvidious = document.getElementsByName("apiService")[1];
	let invidiousSection = document.querySelector(".mainGroup.apiService .section.invidious");
	if (document.querySelector("[name=operationMode]:checked").value === "auto") {
		apiServiceGoogle.checked = true;
		toggleChildOptions(apiServiceGoogle);
		apiServiceInvidious.disabled = true;
		invidiousSection.classList.add("disabled");
		changeApiService();
	} else {
		apiServiceInvidious.disabled = false;
		invidiousSection.classList.remove("disabled");
	}
}
document.getElementsByName("operationMode").forEach(service => {
	service.addEventListener('input', changeOperationMode);
});
function changeApiService() {
	let checkedApiService = document.querySelector("[name=apiService]:checked");
	let allApiSwitch = document.querySelectorAll(".apiSwitch");
	for (let apiSwitch of allApiSwitch) {
		if (apiSwitch.classList.contains(checkedApiService.value))
			apiSwitch.classList.remove("hide");
		else
			apiSwitch.classList.add("hide");
	}
}
document.getElementsByName("apiService").forEach(service => {
	service.addEventListener('input', changeApiService);
});


function toggleChildOptions(ele) {
	function disableChildControls(topParent) {
		childOptions.querySelectorAll(":is(.setting, button, details):not(.stayDisabled)").forEach(setting => {
			setting.disabled = !topParent.checked;
		});
	}
	let childOptions;
	if (ele.type === "radio") {
		let radioGroup = document.getElementsByName(ele.name);
		radioGroup.forEach(radio => {
			childOptions = radio.parentElement.querySelector(".sectionList") || radio.parentElement.querySelector(".formatPart");
			if (childOptions !== null) {
				if (radio.checked)
					childOptions.classList.remove("disabled");
				else
					childOptions.classList.add("disabled");
				disableChildControls(radio);
			}
		});
	} else {
		childOptions = ele.parentElement.querySelector(".sectionList") || ele.parentElement.querySelector(".formatPart");
		if (childOptions !== null) {
			if (ele.checked)
				childOptions.classList.remove("disabled");
			else
				childOptions.classList.add("disabled");
			disableChildControls(ele);
		}
	}
}

async function populateInvidiousDefaultInstancesSelect(index) {
	let invidiousDefaultInstancesSelect = document.getElementById("invidiousDefaultInstances");
	let selectedInstance = options.invidiousDefaultInstances[index]?.domain || invidiousDefaultInstancesSelect.selectedOptions[0]?.value;
	invidiousDefaultInstancesSelect.replaceChildren();
	options.invidiousDefaultInstances.forEach(instance => {
		let optionElem = document.createElement("option");
		optionElem.textContent = `${instance.domain} (${instance.flag} ${instance.region}, ${instance.uptime}% uptime)`;
		optionElem.value = instance.domain;
		invidiousDefaultInstancesSelect.appendChild(optionElem);
	});
	if (selectedInstance)
		invidiousDefaultInstancesSelect.selectedIndex = Math.max(0, options.invidiousDefaultInstances.findIndex(instance => instance.domain === selectedInstance));
}

async function getInvidiousInstances() {
	let invidiousDefaultInstances = []
	let invidiousDefaultInstancesSelect = document.getElementById("invidiousDefaultInstances");
	let refreshInvidiousDefaultInstances = document.getElementById("refreshInvidiousDefaultInstances");
	invidiousDefaultInstancesSelect.disabled = true;
	refreshInvidiousDefaultInstances.disabled = true;
	let abortController = new AbortController();
	const requestTimeout = setTimeout(() => {
		abortController.abort();// Abort request after 30 seconds if not complete.
	}, 5000);
	let response;
	let responseBody;
	try {
		response = await fetch("https://api.invidious.io/instances.json?sort_by=type,health", {signal: abortController.signal});
		if (!response.ok)
			throw `Response not ok: ${response.status} ${response.statusText}`;
		responseBody = await response.json();
		options.invidiousDefaultInstances = [];
		responseBody.forEach(instance => {
			if (instance[1].api !== true || instance[1].type !== "https" || instance[1].monitor?.dailyRatios[0].label !== "success")
				return;
			options.invidiousDefaultInstances.push({
				domain: instance[0],
				flag: instance[1].flag,
				region: instance[1].region,
				uptime: instance[1].monitor['30dRatio'].ratio
			});
		});
		await populateInvidiousDefaultInstancesSelect();
		await saveAndRestoreOptions("save");
	} catch(error) {
		console.error(error);
		if (error.message.includes("NetworkError"))
			showErrorDialog("Invidious error", "Could not send request. Check your internet connection.");
		else if (error.name === "AbortError")
			showErrorDialog("Invidious error", "Connection timed out.");
		else if (response.status > 499 && response.status < 600)
			showErrorDialog("Invidious error", `Server error: ${response.status} ${response.statusText}`);
		else if (response.status > 399 && response.status < 500) {
			showErrorDialog("Invidious error", error);
		}
	} finally {
		invidiousDefaultInstancesSelect.disabled = false;
		refreshInvidiousDefaultInstances.disabled = false;
	}
}
document.getElementById("refreshInvidiousDefaultInstances").addEventListener("click", getInvidiousInstances);

document.getElementById("export").addEventListener('click', async () => {
	let permissionRequest = await browser.permissions.request({
		permissions: ["downloads"]
	});
	if (!permissionRequest)
		return;
	let storageStats = await browser.storage.local.get("stats");
	const exportObject = {
		name: "YouTooltip",
		version: browser.runtime.getManifest().version,
		options: options,
		stats:  storageStats.stats
	};
	let downloadItem;
	const blob = new Blob([JSON.stringify(exportObject)], {type: "application/json"});
	const objectURL = URL.createObjectURL(blob);
	function downloadsChanged(delta) {
		if (delta.id === downloadItem && delta.state.current === "complete") {
			browser.downloads.onChanged.removeListener(downloadsChanged);
			URL.revokeObjectURL(objectURL);
		}
	}
	try {
		browser.downloads.onChanged.addListener(downloadsChanged);
		downloadItem = await browser.downloads.download({
			url: objectURL,
			filename: "YouTooltip.json",
			saveAs: true,
			conflictAction: "overwrite"
		});
	} catch(error) {
		browser.downloads.onChanged.removeListener(downloadsChanged);
		URL.revokeObjectURL(objectURL);
		if (error.message !== "Download canceled by the user") {
			console.error(error);
			showErrorDialog("Export error", "Could not save export file:\n" + error.message);
		}
	}
});
document.getElementById("import").addEventListener('click', async () => {
	// Create a hidden file input, fill it with the necessary data, then trigger it.
	const inputEle = document.createElement('input');
	async function readFile() {
		if (inputEle.files.length) {
			let file = inputEle.files[0];
			const fileReader = new FileReader();
			fileReader.onerror = (event) => {
				console.error(event);
			};
			fileReader.onloadend = async () => {
				try {
					let data = JSON.parse(fileReader.result);
					if (data.name === "YouTooltip") {
						if (await showConfirmDialog("Import", "Import and overwrite settings and statistics?")) {
							let checkedImport = await browser.runtime.sendMessage({
								command: "checkImport",
								version: data.version,
								optionsObj: data.options,
								statsObj: data.stats
							});
							await saveAndRestoreOptions("import", {
								checkedImport: checkedImport,
							});
						}
					} else {
						throw("Incorrect backup file. Try a different file.");
					}
				} catch(error) {
					console.error(error);
					showErrorDialog("Import error", `Could not import settings:\n${error.name === "SyntaxError" ? "JSON syntax corrupted." : error.message || error}`);
				}
			};
			await fileReader.readAsText(file);
		}
		inputEle.remove();
	}
	inputEle.style.display = "none";
	inputEle.type = "file";
	inputEle.accept = ".json";
	inputEle.onchange = readFile;
	document.body.appendChild(inputEle);
	inputEle.click();
});

document.getElementById("badgeColor").addEventListener("change", async () => {
	await browser.browserAction.setBadgeBackgroundColor({color: options.badgeColor});
});
document.getElementById("customTooltipCSS").addEventListener("change", (e) => {
	document.getElementById("customTooltipCSSPreview").style = e.target.value;
});

const allSettings = document.querySelectorAll(".setting");
const allCheckboxes = document.querySelectorAll("[type='checkbox']");
const allRadios = document.querySelectorAll("[type='radio']");
allSettings.forEach(setting => {
	setting.addEventListener("change", async () => {
		await saveAndRestoreOptions("save");
	});
});
allCheckboxes.forEach(checkbox => {
	checkbox.addEventListener("change", () => {
		toggleChildOptions(checkbox);
	});
});
allRadios.forEach(radio => {
	radio.addEventListener("change", () => {
		toggleChildOptions(radio);
	});
});


async function onStorageChange(changes) {
	if ("stats" in changes)
		await updateStats(changes.stats.newValue);
}
const allTabs = document.querySelectorAll(".tab");
allTabs.forEach(tab => {
	tab.addEventListener("click", async () => {
		if (tab.dataset.tab === "statistics") {
			await updateStats();
			browser.storage.local.onChanged.addListener(onStorageChange);
		} else {
			browser.storage.local.onChanged.removeListener(onStorageChange);
		}
		let currentSelectedTab = document.querySelector(".tab.selected");
		currentSelectedTab.classList.remove("selected");
		currentSelectedTab.setAttribute("aria-selected", false);
		document.querySelector(`[data-panel=${currentSelectedTab.dataset.tab}]`).classList.remove("show");
		tab.classList.add("selected");
		tab.setAttribute("aria-selected", true);
		document.querySelector(".mainHeader h2").textContent = tab.querySelector("span").textContent;
		document.querySelector(`[data-panel=${tab.dataset.tab}]`).classList.add("show");
		scroll({top: 0});
	});
});

const toLongNumber = new Intl.NumberFormat("default");
async function updateStats() {
	if (window.browser === undefined)// For testing as a local html file.
		return;
	let storageStats = await browser.storage.local.get("stats");
	if (storageStats.stats === undefined) {
		await browser.runtime.sendMessage({command: "resetStats"});
		await updateStats();
		return;
	}
	let allStats = document.querySelectorAll(".statContainer .stat");
	allStats.forEach(statEle => {
		statEle.querySelector(".value").textContent = toLongNumber.format((storageStats.stats[statEle.dataset.stat]));
	});
}
document.getElementById("resetStats").addEventListener('click', async () => {
	if (await showConfirmDialog("Reset statistics", "Reset statistics?")) {
		await browser.runtime.sendMessage({command: "resetStats"});
		await updateStats();
	}
});

function showErrorDialog(title, text) {
	let errorDialog = document.getElementById("errorDialog");
	errorDialog.querySelector(".title").textContent = title;
	errorDialog.querySelector(".text").textContent = text;
	errorDialog.showModal();
}

function showConfirmDialog(title, text) {
	let confirmDialog = document.getElementById("confirmDialog");
	confirmDialog.querySelector(".title").textContent = title;
	confirmDialog.querySelector(".text").textContent = text;
	let closeDialogPromise = new Promise((resolve, reject) => {
		confirmDialog.addEventListener("close", () => {
			resolve(confirmDialog.returnValue === "ok");
		}, {once: true});
	});
	confirmDialog.showModal();
	return closeDialogPromise;
}

function parseBlacklist(blacklist) {
	// Remove error-causing characters and empty lines.
	let blacklistArray = blacklist.replaceAll(/[ *%^[\]:"\/|<>]/g, "").split("\n").filter(Boolean);
	let testURL;
	blacklistArray.forEach((entry, index) => {
		try {
			testURL = new URL((entry.startsWith("http") ? "" : "https://") + entry);
		} catch(error) {
			return error;
		}
		blacklistArray[index] = testURL.host;
	})
	return blacklistArray;
}

var options;
async function saveAndRestoreOptions(opt, configObject) {
	let properties = ["value", "checked", "selectedIndex", "radio"];
	let optionsList = [
		{name: "operationMode", type: 3},
		
		{name: "apiService", type: 3},
		{name: "keyCustom", type: 0},
		{name: "keyDefaultIndex", type: 2},
		{name: "invidiousDefaultInstances", type: 2},
		{name: "invidiousCustomInstance", type: 0},
		
		{name: "displayMode", type: 3},
		{name: "customTooltipCSS", type: 0},
		{name: "videosEnable", type: 1},
		{name: "videosDurationEnable", type: 1},
		{name: "videosDurationFormat", type: 2},
		{name: "videosPublishedEnable", type: 1},
		{name: "videosPublishedFormat", type: 2},
		{name: "videosPublishedEnableInvidious", type: 1},
		{name: "videosPublishedFormatInvidious", type: 2},
		{name: "videosViewcountEnable", type: 1},
		{name: "videosViewcountFormat", type: 2},
		{name: "videosLikesEnable", type: 1},
		{name: "videosLikesFormat", type: 2},
		{name: "videosChannelEnable", type: 1},
		
		{name: "playlistsEnable", type: 1},
		{name: "playlistsPublishedEnable", type: 1},
		{name: "playlistsPublishedFormat", type: 2},
		{name: "playlistsUpdatedEnableInvidious", type: 1},
		{name: "playlistsUpdatedFormatInvidious", type: 2},
		{name: "playlistsPrivacyEnable", type: 1},
		{name: "playlistsVideoCountEnable", type: 1},
		{name: "playlistsVideoCountFormat", type: 2},
		{name: "playlistsChannelEnable", type: 1},
		
		{name: "badgeEnable", type: 1},
		{name: "badgeCount", type: 2},
		{name: "badgeColor", type: 0},
		
		{name: "statsEnable", type: 1},
		
		{name: "blacklist", type: 0}
	];
	
	if (opt === "save") {
		try {
			let blacklistArray = parseBlacklist(document.getElementById("blacklist").value);
			document.getElementById("blacklist").value = blacklistArray.join("\n");
			
			optionsList.forEach(option => {
				if (option.name === "blacklist") {
					options[option.name] = blacklistArray;
				} else if (option.name === "invidiousDefaultInstances") {
					options.invidiousDefaultInstance = document.getElementById("invidiousDefaultInstances").selectedIndex;
				} else if (option.type === 3) {
					options[option.name] = document.querySelector(`[name=${option.name}]:checked`).value;
				} else {
					options[option.name] = document.getElementById(option.name)[properties[option.type]];
				}
			});
			
			await browser.storage.local.set({options});
			return true;
		} catch(error) {
			console.error(error);
			if (error.message.startsWith("Invalid url pattern"))
				showErrorDialog("Options error", "Could not save options:\nInvalid url pattern: " + error.message.replace("Invalid url pattern: ", ""));
			else
				showErrorDialog("Options error", "Could not save options:\n" + error);
			return false;
		}
	} else if (opt === "restore") {
		try {
			let storageOptions = await browser.storage.local.get("options");
			options = storageOptions.options;
			if (options === undefined) {
				await browser.runtime.sendMessage({command: "reset", reset:"options"});
				await saveAndRestoreOptions("restore");
				return;
			}
			
			optionsList.forEach(option => {
				if (option.name === "blacklist") {
					document.getElementById("blacklist").value = options[option.name].join("\n");
				} else if (option.name === "invidiousDefaultInstances") {
					populateInvidiousDefaultInstancesSelect(options.invidiousDefaultInstance);
				} else if (option.type === 3) {
					document.querySelector(`[name=${option.name}][value=${options[option.name]}]`).checked = true;
				} else {
					document.getElementById(option.name)[properties[option.type]] = options[option.name];
				}
			});
			changeOperationMode();
			changeApiService();
			await updateNotificationPermission();
			await updateStats();
			allCheckboxes.forEach(checkbox => {
				toggleChildOptions(checkbox);
			});
			allRadios.forEach(radio => {
				toggleChildOptions(radio);
			});
			document.getElementById("customTooltipCSSPreview").style = options.customTooltipCSS;
			return true;
		} catch(error) {
			console.error(error);
			showErrorDialog("Options error", "Could not restore options:\n" + error);
			return false;
		}
	} else if (opt === "import") {
		try {
			options = configObject.checkedImport.checkedOptions;
			await browser.storage.local.set({
				options,
				stats: configObject.checkedImport.checkedStats
			});
			await saveAndRestoreOptions("restore");
			return true;
		} catch(error) {
			console.error(error);
			showErrorDialog("Options error", "Could not import options:\n" + error);
			return false;
		}
	}
}

document.addEventListener("DOMContentLoaded", async () => {
	if (window.browser !== undefined) {
		document.getElementById("versionNumber").textContent = browser.runtime.getManifest().version;
		await saveAndRestoreOptions("restore");
		if (browser.runtime.getManifest().manifest_version === 3) {
			// Helpful reminder while testing and can be removed when Google and Mozilla fully work out the details of Manifest V3.
			// The initial specs for MV3 called for treating host permissions as always optional.
			// However, according to the latest discussions (https://bugzilla.mozilla.org/show_bug.cgi?id=1766026#c1), this may no longer be the case.
			let manifestV3 = document.getElementById("manifestV3");
			manifestV3.classList.add("show");
			if (!await browser.permissions.contains({origins: ["<all_urls>"]})) {
				let overlay = document.querySelector(".overlay");
				let overlayPermissions = overlay.querySelector(".permissions");
				let mV3RequestPermissions = document.getElementById("mV3RequestPermissions");
				overlay.classList.add("show");
				overlayPermissions.classList.add("show");
				mV3RequestPermissions.onclick = async () => {
					let permissionRequest = await browser.permissions.request({
						origins: ["<all_urls>"]
					});
					if (permissionRequest) {
						overlay.classList.remove("show");
						overlayPermissions.classList.remove("show");
					}
				};
				mV3RequestPermissions.focus();
			}
		}
		
		if (window.location.hash === "#releaseNotes") {
			document.querySelector(`[data-tab=about]`).click();
			setTimeout(() => {
				document.getElementById("releaseNotes").scrollIntoView({behavior: "smooth"});
			}, 10);
		}
	}
	document.querySelector(".content").classList.add("show");
});
