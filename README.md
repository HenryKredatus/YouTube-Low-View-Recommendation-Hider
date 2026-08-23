# YouTube Low-View Recommendation Hider

This is a Tampermonkey userscript to hide/block low-view (less than 1,000 by default) YouTube recommendations on any desktop browser.

YouTube tends to force such recommendations into people's feeds, especially near the top of video sidebars, where one almost always appears in the third or fourth slot down. It will continue to do this no matter how many times you do "not interested" or "don't recommend channel" on them, so to eliminate them for good, I created this script. I will update this as-needed, and it will autoupdate for you as well.

## Without

![WITHOUT](Screenshot1.png)

## With

![WITH](Screenshot2.png)

## Installation

1. Install Tampermonkey from https://www.tampermonkey.net/
2. Go to "create a new script"
3. Paste in all the code from the included JS file
4. Do file, then save or just ctrl+s on the script and it will automatically be active on all new YouTube windows you open
5. Adjust the integer for the VIEW_THRESHOLD variable on line 20 to change the minimum number of views you want your recommendations to have (1,000+ by default)
