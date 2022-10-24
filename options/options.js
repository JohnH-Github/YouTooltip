"use strict";

function saveButtonHighlight(highlight) {
	let saveButton = document.getElementById("saveButton");
	if (highlight) {
		saveButton.disabled = false;
		saveButton.classList.add("unsaved");
	} else {
		saveButton.disabled = true;
		saveButton.classList.remove("unsaved");
	}
}

async function updateNotificationPermission() {
	let notificationPermission = document.getElementById("notificationPermission");
	if (await browser.permissions.contains({permissions: ["notifications"]})) {
		notificationPermission.parentElement.classList.add("granted");
		notificationPermission.disabled = true;
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

document.getElementById("saveButton").addEventListener('click', async () => {
	let saveButton = document.getElementById("saveButton");
	let saveOk = await saveAndRestoreOptions("save");
	if (saveOk)
		saveButtonHighlight(false);
});
document.getElementById("resetOptionsButton").addEventListener('click', async () => {
	if (confirm("All options will be reset, but statistics will remain.\nReset options?")) {
		await browser.runtime.sendMessage({command: "reset", reset:"options"});
		await saveAndRestoreOptions("restore");
		saveButtonHighlight(false);
	}
});
document.getElementById("resetEverythingButton").addEventListener('click', async () => {
	if (confirm("ALL options and statistics will be reset.\nReset everything?")) {
		await browser.runtime.sendMessage({command: "reset", reset:"everything"});
		await saveAndRestoreOptions("restore");
		saveButtonHighlight(false);
	}
});

function changeOperationMode() {
	let apiServiceGoogle = document.getElementsByName("apiService")[0];
	let invidiousSection = document.querySelector(".mainGroup.apiService .section.invidious");
	if (document.querySelector("[name=operationMode]:checked").value === "auto") {
		apiServiceGoogle.checked = true;
		toggleChildOptions(apiServiceGoogle);
		invidiousSection.classList.add("disabled");
		changeApiService();
	} else {
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
	if (ele.type === "radio") {
		let childOptions;
		let radioGroup = document.getElementsByName(ele.name);
		radioGroup.forEach(radio => {
			childOptions = radio.parentElement.querySelector(".sectionList") || radio.parentElement.querySelector(".formatPart");
			if (childOptions !== null) {
				if (radio.checked)
					childOptions.classList.remove("disabled");
				else
					childOptions.classList.add("disabled");
			}
		});
	} else {
		let sectionList = ele.parentElement.querySelector(".sectionList");
		let formatPart = ele.parentElement.querySelector(".formatPart");
		if (sectionList !== null) {
			if (ele.checked)
				sectionList.classList.remove("disabled");
			else
				sectionList.classList.add("disabled");
		} else if (formatPart !== null) {
			if (ele.checked)
				formatPart.classList.remove("disabled");
			else
				formatPart.classList.add("disabled");
			formatPart.querySelector("select").disabled = !ele.checked;
		}
	}
}

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
			alert("Could not save export file:\n" + error.message);
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
						if (confirm("Import and overwrite settings and statistics?")) {
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
					alert(`Could not import settings:\n${error.name === "SyntaxError" ? "JSON syntax corrupted." : error.message || error}`);
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

const allSettings = document.querySelectorAll(".setting");
const allCheckboxes = document.querySelectorAll("[type='checkbox']");
const allRadios = document.querySelectorAll("[type='radio']");
allSettings.forEach(setting => {
	setting.addEventListener("input", () => {
		saveButtonHighlight(true);
	});
});
allCheckboxes.forEach(checkbox => {
	checkbox.addEventListener("input", () => {
		toggleChildOptions(checkbox);
	});
});
allRadios.forEach(radio => {
	radio.addEventListener("input", () => {
		toggleChildOptions(radio);
	});
});

const allTabs = document.querySelectorAll(".tab");
allTabs.forEach(tab => {
	tab.addEventListener("click", async () => {
		if (tab.dataset.tab === "statistics")
			await updateStats();
		let currentSelectedTab = document.querySelector(".tab.selected");
		currentSelectedTab.classList.remove("selected");
		document.querySelector(`[data-panel=${currentSelectedTab.dataset.tab}]`).classList.remove("show");
		tab.classList.add("selected");
		document.querySelector(`[data-panel=${tab.dataset.tab}]`).classList.add("show");
		scroll({top: 0});
	});
});

const toLongNumber = new Intl.NumberFormat("default");
async function updateStats() {
	if (window.browser === undefined)// For testing as a local html file.
		return;
	let storageStats = await browser.storage.local.get("stats");
	let allStats = document.querySelectorAll(".statContainer .stat");
	allStats.forEach(statEle => {
		statEle.querySelector(".value").textContent = toLongNumber.format((storageStats.stats[statEle.dataset.stat]));
	});
}
document.getElementById("resetStats").addEventListener('click', async () => {
	if (confirm("Reset statistics?")) {
		await browser.runtime.sendMessage({command: "resetStats"});
		await updateStats();
	}
});
document.getElementById("refreshStats").addEventListener('click', updateStats);

function parseBlacklist(blacklist) {
	// Remove error-causing characters and empty lines.
	let blacklistArray = blacklist.replaceAll(/[ *%^[\]:"|<>]/g, "").split("\n").filter(Boolean);
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
		{name: "invidiousDefaultInstance", type: 2},
		{name: "invidiousCustomInstance", type: 0},
		
		{name: "displayMode", type: 3},
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
				alert("Could not save options\nInvalid url pattern: " + error.message.replace("Invalid url pattern: ", ""));
			else
				alert("Could not save options\n" + error);
			return false;
		}
	} else if (opt === "restore") {
		try {
			let storageOptions = await browser.storage.local.get("options");
			options = storageOptions.options;
			
			optionsList.forEach(option => {
				if (option.name === "blacklist") {
					document.getElementById("blacklist").value = options[option.name].join("\n");
				} else if (option.type === 3) {
					document.querySelector(`[name=${option.name}][value=${options[option.name]}]`).checked = true;
				} else {
					document.getElementById(option.name)[properties[option.type]] = options[option.name];
				}
			});
			saveButtonHighlight(false);
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
			return true;
		} catch(error) {
			console.error(error);
			alert("Could not restore options\n" + error);
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
			alert("Could not import options\n" + error);
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
