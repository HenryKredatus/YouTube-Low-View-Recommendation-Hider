# YouTube Low-View Recommendation Hider

This is a Tampermonkey userscript to hide/block low-view (less than 1,000 by default) YouTube recommendations on any desktop browser.

YouTube tends to force such recommendations into people's feeds, especially near the top of video sidebars, where one almost always appears in the third or fourth slot down. It will continue to do this no matter how many times you do "not interested" or "don't recommend channel" on them, so to eliminate them for good, I created this script. I will update this as-needed, and it will autoupdate for you as well.

## Without

![WITHOUT](Screenshot1.png)

## With

![WITH](Screenshot2.png)

## Installation

1. Install Tampermonkey from https://www.tampermonkey.net/
2. Click this link: [YouTube Low-View Recommendation Hider.user.js](https://raw.githubusercontent.com/HenryKredatus/YouTube-Low-View-Recommendation-Hider/main/YouTube%20Low-View%20Recommendation%20Hider.user.js) -Tampermonkey will pop up an install prompt.
3. Click Install.
4. Adjust `VIEW_THRESHOLD` on line 20 if you want a different minimum view count (1,000 by default).
