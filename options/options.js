"use strict";

let options;

window.addEventListener("error", (ErrorEvent) => {
	showErrorDialog("Uncaught error", `${ErrorEvent.message}\nLine: ${ErrorEvent.lineno}, column: ${ErrorEvent.colno}`);
});

document.getElementById("sidebarToggle").addEventListener("click", (e) => {
	e.stopImmediatePropagation();
	function hideSidebar(e) {
		e.preventDefault();
		sidebar.classList.remove("show");
		main.removeEventListener("click", hideSidebar);
	}
	let sidebar = document.querySelector(".sidebar");
	let main = document.querySelector("main");
	sidebar.classList.toggle("show");
	main.addEventListener("click", hideSidebar);
});

async function updatePermission(permission, isGranted) {
	let permissionRequest = document.querySelector(`.permissionRequest[data-permission='${(permission.origins || permission.permissions)[0]}']`);
	if (permissionRequest !== null) {
		let requestButton = permissionRequest.querySelector("button");
		if (isGranted === undefined) {
			isGranted = await browser.permissions.contains(permission);
		}
		permissionRequest.classList.toggle("granted", isGranted);
		requestButton.classList.toggle("stayDisabled", isGranted);
		requestButton.disabled = isGranted;
		if ((permission.origins || permission.permissions)[0] === "<all_urls>") {
			document.getElementById("permissionNotice").classList.toggle("hide", isGranted);
		}
	}
}
browser.permissions.onAdded.addListener((permissions) => {
	Object.keys(permissions).some((key) => {
		if (permissions[key].length) {
			updatePermission({[key]: [permissions[key][0]]}, true);
			return true;
		}
	});
});
browser.permissions.onRemoved.addListener((permissions) => {
	Object.keys(permissions).some((key) => {
		if (permissions[key].length) {
			updatePermission({[key]: [permissions[key][0]]}, false);
			return true;
		}
	});
});
document.querySelectorAll(".permissionRequest").forEach((permissionRequest) => {
	const permissionObject = {
		[permissionRequest.dataset.permissionType]: [permissionRequest.dataset.permission]
	};
	updatePermission(permissionObject);
	permissionRequest.querySelector(".permissionGrantButton").addEventListener("click", async () => {
		await browser.permissions.request(permissionObject);
	});
	permissionRequest.querySelector(".permissionRevokeButton").addEventListener("click", async () => {
		await browser.permissions.remove(permissionObject);
	});
});

document.getElementById("gotoPermissionRequestButton").addEventListener("click", () => {
	document.querySelector("[data-tab=welcome]").click();
});
document.getElementById("closePermissionNoticeButton").addEventListener("click", () => {
	document.getElementById("permissionNotice").classList.add("stayHidden");
	if (!options.hiddenNotices.includes("optionsAllUrls")) {
		options.hiddenNotices.push("optionsAllUrls");
	}
})

document.getElementById("resetOptionsButton").addEventListener("click", async () => {
	if (await showConfirmDialog("Reset options", "All options will be reset, but statistics and permissions will remain.\nReset options?")) {
		await browser.runtime.sendMessage({command: "reset", reset:"options"});
		await saveAndRestoreOptions("restore");
	}
});
document.getElementById("resetEverythingButton").addEventListener("click", async () => {
	if (await showConfirmDialog("Reset everything", "ALL options and statistics will be reset, but permissions will remain.\nReset everything?")) {
		await browser.runtime.sendMessage({command: "reset", reset:"everything"});
		await saveAndRestoreOptions("restore");
	}
});

function changeOperationMode() {
	let apiServiceGoogle = document.getElementsByName("apiService")[0];
	let apiServiceInvidious = document.getElementsByName("apiService")[1];
	let apiServicePiped = document.getElementsByName("apiService")[2];
	let invidiousSection = document.querySelector(".mainGroup.apiService .section.invidious");
	let pipedSection = document.querySelector(".mainGroup.apiService .section.piped");
	if (document.querySelector("[name=operationMode]:checked").value === "auto") {
		apiServiceGoogle.checked = true;
		toggleChildOptions(apiServiceGoogle);
		apiServiceInvidious.disabled = true;
		invidiousSection.classList.add("disabled");
		apiServicePiped.disabled = true;
		pipedSection.classList.add("disabled");
		changeApiService();
	} else {
		apiServiceInvidious.disabled = false;
		invidiousSection.classList.remove("disabled");
		apiServicePiped.disabled = false;
		pipedSection.classList.remove("disabled");
	}
}
document.getElementsByName("operationMode").forEach((service) => {
	service.addEventListener("input", changeOperationMode);
});
function changeApiService() {
	let checkedApiService = document.querySelector("[name=apiService]:checked");
	let allApiSwitch = document.querySelectorAll(".apiSwitch");
	for (let apiSwitch of allApiSwitch) {
		apiSwitch.classList.toggle("hide", !apiSwitch.classList.contains(checkedApiService.value));
	}
}
document.getElementsByName("apiService").forEach((service) => {
	service.addEventListener("input", changeApiService);
});


function toggleChildOptions(ele) {
	function disableChildControls(topParent, childOptions) {
		childOptions.querySelectorAll(":is(.setting, button, details):not(.stayDisabled)").forEach((setting) => {
			setting.disabled = !topParent.checked;
		});
	}
	let childOptions;
	if (ele.type === "radio") {
		let radioGroup = document.getElementsByName(ele.name);
		radioGroup.forEach((radio) => {
			childOptions = radio.closest(":not(label, .setting)").querySelector(":is(.sectionList, .formatPart)");
			if (childOptions !== null) {
				childOptions.classList.toggle("disabled", !radio.checked);
				disableChildControls(radio, childOptions);
			}
		});
	} else {
		childOptions = ele.closest(":not(label, .setting)").querySelector(":is(.sectionList, .formatPart)");
		if (childOptions !== null) {
			childOptions.classList.toggle("disabled", !ele.checked);
			disableChildControls(ele, childOptions);
		}
	}
}

function populateInvidiousDefaultInstancesSelect(index) {
	let invidiousDefaultInstancesSelect = document.getElementById("invidiousDefaultInstances");
	let selectedInstance = options.invidiousDefaultInstances[index]?.domain || invidiousDefaultInstancesSelect.selectedOptions[0]?.value;
	invidiousDefaultInstancesSelect.replaceChildren();
	options.invidiousDefaultInstances.forEach((instance) => {
		let optionElem = document.createElement("option");
		optionElem.textContent = `${instance.domain} (${instance.flag} ${instance.region}, ${instance.uptime}% uptime)`;
		optionElem.value = instance.domain;
		invidiousDefaultInstancesSelect.appendChild(optionElem);
	});
	if (selectedInstance) {
		invidiousDefaultInstancesSelect.selectedIndex = Math.max(0, options.invidiousDefaultInstances.findIndex((instance) => instance.domain === selectedInstance));
	}
}

async function getInvidiousInstances() {
	let invidiousDefaultInstancesSelect = document.getElementById("invidiousDefaultInstances");
	let refreshInvidiousDefaultInstances = document.getElementById("refreshInvidiousDefaultInstances");
	invidiousDefaultInstancesSelect.disabled = true;
	refreshInvidiousDefaultInstances.disabled = true;
	let response;
	let responseBody;
	try {
		response = await fetch("https://api.invidious.io/instances.json?sort_by=type,health", {cache: "no-cache", credentials: "omit"});
		if (!response.ok) {
			throw `Response not ok: ${response.status} ${response.statusText}`;
		}
		responseBody = await response.json();
		options.invidiousDefaultInstances = [];
		responseBody.forEach((instance) => {
			if (instance[1].api !== true || instance[1].type !== "https" || instance[1].monitor?.down) {
				return;
			}
			options.invidiousDefaultInstances.push({
				domain: instance[0],
				flag: instance[1].flag,
				region: instance[1].region,
				uptime: instance[1].monitor.uptime
			});
		});
		await populateInvidiousDefaultInstancesSelect();
		await saveAndRestoreOptions("save");
	} catch(error) {
		console.error(error);
		if (error.message.includes("NetworkError")) {
			showErrorDialog("Invidious error", "Could not send request. Check your internet connection.");
		} else if (error.name === "AbortError") {
			showErrorDialog("Invidious error", "Connection timed out.");
		} else if (response.status > 499 && response.status < 600) {
			showErrorDialog("Invidious error", `Server error: ${response.status} ${response.statusText}`);
		} else {
			showErrorDialog("Invidious error", error);
		}
	} finally {
		invidiousDefaultInstancesSelect.disabled = false;
		refreshInvidiousDefaultInstances.disabled = false;
	}
}
document.getElementById("refreshInvidiousDefaultInstances").addEventListener("click", getInvidiousInstances);

function populatePipedDefaultInstancesSelect(index) {
	let pipedDefaultInstancesSelect = document.getElementById("pipedDefaultInstances");
	let selectedInstance = options.pipedDefaultInstances[index]?.domain || pipedDefaultInstancesSelect.selectedOptions[0]?.value;
	pipedDefaultInstancesSelect.replaceChildren();
	options.pipedDefaultInstances.forEach((instance) => {
		let optionElem = document.createElement("option");
		optionElem.textContent = `${instance.name} (${instance.flag}${instance.cdn ? ", CDN" : ""})`;
		optionElem.value = instance.domain;
		pipedDefaultInstancesSelect.appendChild(optionElem);
	});
	if (selectedInstance) {
		pipedDefaultInstancesSelect.selectedIndex = Math.max(0, options.pipedDefaultInstances.findIndex((instance) => instance.domain === selectedInstance));
	}
}
async function getPipedInstances() {
	let pipedDefaultInstancesSelect = document.getElementById("pipedDefaultInstances");
	let refreshPipedDefaultInstances = document.getElementById("refreshPipedDefaultInstances");
	pipedDefaultInstancesSelect.disabled = true;
	refreshPipedDefaultInstances.disabled = true;
	let response;
	let responseBody;
	try {
		response = await fetch("https://raw.githubusercontent.com/wiki/TeamPiped/Piped-Frontend/Instances.md", {cache: "no-cache", credentials: "omit"});
		if (!response.ok) {
			throw `Response not ok: ${response.status} ${response.statusText}`;
		}
		responseBody = await response.text();
		options.pipedDefaultInstances = [];
		let skipped = 0;
		const lines = responseBody.split("\n");
		lines.map((line) => {
			const split = line.split("|");
			if (split.length > 4) {
				if (skipped < 2) {
					skipped++;
					return;
				}
				options.pipedDefaultInstances.push({
					cdn: split[3].trim() === "Yes",
					domain: split[1].trim(),
					flag: split[2].trim(),
					name: split[0].trim()
				});
			}
		});
		await populatePipedDefaultInstancesSelect();
		await saveAndRestoreOptions("save");
	} catch(error) {
		console.error(error);
		if (error.message.includes("NetworkError")) {
			showErrorDialog("Piped error", "Could not send request. Check your internet connection.");
		} else if (error.name === "AbortError") {
			showErrorDialog("Piped error", "Connection timed out.");
		} else if (response.status > 499 && response.status < 600) {
			showErrorDialog("Piped error", `Server error: ${response.status} ${response.statusText}`);
		} else if (response.status > 399 && response.status < 500) {
			showErrorDialog("Piped error", error);
		}
	} finally {
		pipedDefaultInstancesSelect.disabled = false;
		refreshPipedDefaultInstances.disabled = false;
	}
}
document.getElementById("refreshPipedDefaultInstances").addEventListener("click", getPipedInstances);

document.getElementById("export").addEventListener("click", async () => {
	const exportObject = {
		name: "YouTooltip",
		options,
		stats: (await browser.storage.local.get("stats")).stats,
		version: browser.runtime.getManifest().version
	};
	let exportLink = document.createElement("a");
	exportLink.href = URL.createObjectURL(
		new Blob([JSON.stringify(exportObject)], {type:"application/json"})
	)
	exportLink.target = "_blank";
	exportLink.download = "YouTooltip.json";
	exportLink.click();
});
document.getElementById("import").addEventListener("click", () => {
	// Create a hidden file input, fill it with the necessary data, then trigger it.
	const inputEle = document.createElement("input");
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
								optionsObj: data.options,
								statsObj: data.stats,
								version: data.version
							});
							await saveAndRestoreOptions("import", {
								checkedImport
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
	await browser.action.setBadgeBackgroundColor({color: options.badgeColor});
});
document.getElementById("customTooltipCSS").addEventListener("change", (e) => {
	document.getElementById("customTooltipCSSPreview").style = e.target.value;
});

const allSettings = document.querySelectorAll(".setting");
const allCheckboxes = document.querySelectorAll("[type='checkbox']");
const allRadios = document.querySelectorAll("[type='radio']");
allSettings.forEach((setting) => {
	setting.addEventListener(setting.dataset.settingEvent || "change", async () => {
		await saveAndRestoreOptions("save");
	});
});
allCheckboxes.forEach((checkbox) => {
	checkbox.addEventListener("change", () => {
		toggleChildOptions(checkbox);
	});
});
allRadios.forEach((radio) => {
	radio.addEventListener("change", () => {
		toggleChildOptions(radio);
	});
});


async function onStorageChange(changes) {
	if (Object.hasOwn(changes, "stats")) {
		await updateStats(changes.stats.newValue);
	}
}
const allTabs = document.querySelectorAll(".tab");
allTabs.forEach((tab) => {
	tab.addEventListener("click", async () => {
		if (tab.dataset.tab === "statistics") {
			await updateStats();
			browser.storage.local.onChanged.addListener(onStorageChange);
		} else {
			browser.storage.local.onChanged.removeListener(onStorageChange);
		}
		document.getElementById("permissionNotice").classList.toggle("hiddenInTab", tab.dataset.tab === "welcome");
		let currentSelectedTab = document.querySelector(".tab.selected");
		currentSelectedTab.classList.remove("selected");
		currentSelectedTab.setAttribute("aria-selected", false);
		document.querySelector(`[data-panel=${currentSelectedTab.dataset.tab}]`).classList.remove("show");
		tab.classList.add("selected");
		tab.setAttribute("aria-selected", true);
		document.querySelector(".mainHeader h2").textContent = tab.querySelector("span").textContent;
		document.querySelector(`[data-panel=${tab.dataset.tab}]`).classList.add("show");
		window.scroll({top: 0});
	});
});

const toLongNumber = new Intl.NumberFormat("default");
async function updateStats() {
	if (window.browser === undefined) {// For testing as a local html file.
		return;
	}
	let storageStats = await browser.storage.local.get("stats");
	if (storageStats.stats === undefined) {
		await browser.runtime.sendMessage({command: "resetStats"});
		await updateStats();
		return;
	}
	let allStats = document.querySelectorAll(".statContainer .stat");
	allStats.forEach((statEle) => {
		statEle.querySelector(".value").textContent = toLongNumber.format(storageStats.stats[statEle.dataset.stat]);
	});
}
document.getElementById("resetStats").addEventListener("click", async () => {
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
	let closeDialogPromise = new Promise((resolve) => {
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
	});
	return blacklistArray;
}

async function saveAndRestoreOptions(opt, configObject) {
	let properties = ["value", "checked", "selectedIndex", "radio", "options"];
	let optionsList = [
		{name: "hiddenNotices", type: 4},
		
		{name: "operationMode", type: 3},
		
		{name: "apiService", type: 3},
		{name: "keyCustom", type: 0},
		{name: "keyDefaultIndex", type: 2},
		{name: "invidiousDefaultInstances", type: 2},
		{name: "invidiousCustomInstance", type: 0},
		{name: "pipedDefaultInstances", type: 2},
		{name: "pipedCustomInstance", type: 0},
		
		{name: "displayMode", type: 3},
		{name: "customTooltipCSS", type: 0},
		{name: "notificationAutoDismiss", type: 1},
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
			
			optionsList.forEach((option) => {
				if (option.name === "blacklist") {
					options[option.name] = blacklistArray;
				} else if (option.name === "invidiousDefaultInstances") {
					options.invidiousDefaultInstance = document.getElementById("invidiousDefaultInstances").selectedIndex;
				} else if (option.name === "pipedDefaultInstances") {
					options.pipedDefaultInstance = document.getElementById("pipedDefaultInstances").selectedIndex;
				} else if (option.type === 3) {
					options[option.name] = document.querySelector(`[name=${option.name}]:checked`).value;
				} else if (option.type === 4) {
					
				} else {
					options[option.name] = document.getElementById(option.name)[properties[option.type]];
				}
			});
			
			await browser.storage.local.set({options});
			return true;
		} catch(error) {
			console.error(error);
			showErrorDialog("Options error", error.message.startsWith("Invalid url pattern") ? "Could not save options:\nInvalid url pattern: " + error.message.replace("Invalid url pattern: ", "") : "Could not save options:\n" + error);
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
			
			optionsList.forEach((option) => {
				if (option.name === "blacklist") {
					document.getElementById("blacklist").value = options[option.name].join("\n");
				} else if (option.name === "invidiousDefaultInstances") {
					populateInvidiousDefaultInstancesSelect(options.invidiousDefaultInstance);
				} else if (option.name === "pipedDefaultInstances") {
					populatePipedDefaultInstancesSelect(options.pipedDefaultInstance);
				} else if (option.type === 3) {
					document.querySelector(`[name=${option.name}][value=${options[option.name]}]`).checked = true;
				} else if (option.type === 4) {
					if (option.name === "hiddenNotices") {
						document.getElementById("permissionNotice").classList.toggle("stayHidden", options.hiddenNotices.includes("optionsAllUrls"));
					}
				} else {
					document.getElementById(option.name)[properties[option.type]] = options[option.name];
				}
			});
			changeOperationMode();
			changeApiService();
			await updateStats();
			allCheckboxes.forEach((checkbox) => {
				toggleChildOptions(checkbox);
			});
			allRadios.forEach((radio) => {
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
		if (window.location.hash === "#install") {
			document.querySelector("[data-tab=welcome]").click();
		} else if (window.location.hash === "#releaseNotes") {
			document.querySelector("[data-tab=about]").click();
			setTimeout(() => {
				document.getElementById("releaseNotes").scrollIntoView({behavior: "smooth"});
			}, 10);
		}
	}
	document.body.classList.add("loaded");
});
