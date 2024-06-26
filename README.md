# YouTooltip
[![Mozilla Add-on](https://img.shields.io/amo/v/youtooltip)](https://addons.mozilla.org/en-US/firefox/addon/youtooltip/)

Adds a tooltip containing information about videos and playlists when hovering over a YouTube link.

**Currently supports Firefox only.**

**Notice: In Manifest V3 and Firefox versions 109-126, you will have to manually grant YouTooltip permission to run on webpages. You may either grant access to all sites, only individual sites, or only when clicking on the toolbar button.**

| Tooltip display | Notification display |
| --- | --- |
| ![YouTooltip screenshot tooltip](https://user-images.githubusercontent.com/34670767/187048059-01668031-cdc8-4d81-80e6-b8c316510ae8.jpg) | ![YouTooltip screenshot notification](https://user-images.githubusercontent.com/34670767/187048070-cab54590-d3e2-487b-b24d-9a1db1cbbb41.jpg) |

| Options page. Has both light and dark themes | Popup. Has both light and dark themes |
| --- | --- |
| ![YouTooltip screenshot options](https://github.com/JohnH-Github/YouTooltip/assets/34670767/0997dcb6-db35-4068-bfdc-935630024b64) | ![YouTooltip screenshot popup](https://user-images.githubusercontent.com/34670767/214700724-715e09d2-72fb-4711-94c1-45c0b59d4a64.png) |


## Features
- Supported API's
	- Google.
	- Invidious.
	- Piped.
- Options
	- Operation mode
		- Auto: Send requests on page load and whenever more links are added.
			- Supports Google API only.
		- Hover: Send requests only for links that are hovered over.
			- Supports Google API, Invidious API, and Piped API.
	- Display mode
		- Tooltip.
		- Custom tooltip
		- Notification.
	- Enable/disable information about videos and playlists.
	- Change the display format for certain information.
	- Toolbar button badge.
	- Blacklist.
	- Import/Export.
- Popup
	- Shows statistics for the page.
	- Lists all videos and playlists found on the page.

## Installation
### Install from Firefox AMO
[![Get the Add-on from AMO](https://github.com/JohnH-Github/YouTooltip/assets/34670767/36ef33d9-617e-4772-a485-a40f97641613)](https://addons.mozilla.org/en-US/firefox/addon/youtooltip/)

### Install manually
1. Download an .xpi file from [releases](https://github.com/JohnH-Github/YouTooltip/releases).
2. Go to about:addons in Firefox.
3. Click on the gear icon near the top of the page.
4. Click "Install Add-on From File..."
5. Select the ```.xpi``` file and click "Open".

## Permissions
- Optional
	- **Access your data for all websites**
		- For automatically scanning each page for links to YouTube videos and playlists without user interaction.
	- **Display notifications to you**
		- For notification display mode, instead of displaying youtube info as tooltips.

## Privacy policy
YouTooltip does *not* send user data to me nor use any analytics. I don't care for your browsing habits.

YouTooltip *does* store statistics on your computer; however, you may delete and/or turn them off at any time.

YouTooltip *does* make requests to either Google's API, Invidious' API, or Piped's API for video and playlist information; however, no identifying information is shared. Requests always use HTTPS. The data that is sent to the API of your choice is the video and/or playlist ID's, field options, and an API key (where necessary).

## Other notes
The default API key(s) that YouTooltip uses are my own, and I have the right to disable them at any time for any reason. In addition, Google may also disable them at any time for any reason. You may choose to provide your own API key, but you are responsible for its use.

## Credits
### Fork
Forked from ~~[YoutubeTooltip](https://addons.mozilla.org/en-US/firefox/addon/youtube_tooltip/)~~ (since removed from AMO) written by [Firefox user 14151097](https://addons.mozilla.org/en-US/firefox/user/14151097/). Released under the [MIT license](https://opensource.org/licenses/mit-license.php).
### Icons
All icons (including logo) from [Feather](https://feathericons.com/). Released under the [MIT license](https://github.com/colebemis/feather/blob/master/LICENSE).

## License
[MIT](https://opensource.org/licenses/mit-license.php)
