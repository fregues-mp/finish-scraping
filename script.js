// ░░ fregues ░░ //
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

async function main(playerName, region, outputFormat = 'json') {
  const mapDataFile = path.join(__dirname, 'maps-data.json');
  let mapData = [];
  
  console.log('This may take a while, please wait...');

  try {
    const mapDataContent = fs.readFileSync(mapDataFile, 'utf8');
    mapData = JSON.parse(mapDataContent);
  } catch (err) {
    console.error(err);
  }

  const browser = await puppeteer.launch({
    headless: true,
  });

  const page = await browser.newPage();
  await page.goto(`https://kog.tw/#p=players&player=${playerName}`, { waitUntil: 'domcontentloaded', timeout: 0 });

  // points
  let pointsData = null;

  try {
    await page.waitForSelector('ul.list-group', { timeout: 15000 });
    pointsData = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('li.list-group-item'));

      const fixedText = items.find(el => el.innerText.includes("Fixed points"));
      const seasonText = items.find(el => el.innerText.includes("Season points"));

      const fixed = fixedText?.innerText.match(/(\d+)/);
      const season = seasonText?.innerText.match(/(\d+)/);

      return {
        fixedPoints: fixed ? parseInt(fixed[1]) : 0,
        seasonPoints: season ? parseInt(season[1]) : 0
      };
    });
  } catch (err) {
    console.error('Failed to retrieve points data. The player may not exist or the request timed out.');
    await browser.close();
    return;
  }

  // maps
  await page.waitForSelector('button.nav-link#nav-maps-tab', { timeout: 0 });
  await page.evaluate(() => {
    const button = document.querySelector('button.nav-link#nav-maps-tab');
    if (button) {
      button.scrollIntoView();
      button.click();
    }
  });

  await page.waitForSelector('#pills-finished table tbody tr', { timeout: 0 });
  const mapsData = await page.evaluate(() => {
    const rows = document.querySelectorAll('#pills-finished table tbody tr');
    return Array.from(rows).map((row) => {
      const cols = row.querySelectorAll('td');
      const mapName = row.querySelector('th a')?.innerText.trim();
      return {
        mapName,
        time: cols[0]?.innerText.trim(),
        lastFinish: cols[2]?.innerText.trim(),
      };
    }).filter(r => r.mapName && r.time && r.lastFinish);
  });

  await browser.close();

  const enrichedMaps = mapsData.map((map) => {
    const extra = mapData.find(md => md.map === map.mapName) || { type: 'Unknown', points: 0, stars: 0 };
    return {
      ...map,
      type: extra.type,
      points: extra.points,
      stars: extra.stars
    };
  });

  const result = {
    playerName,
    region,
    points: pointsData,
    totalMaps: enrichedMaps.length,
    maps: enrichedMaps
  };

  const outputDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  const filePath = path.join(outputDir, `${playerName.replace(/[^a-z0-9]/gi, '_')}.${outputFormat}`);
  let content;

  if (outputFormat === 'json') {
    content = JSON.stringify(result, null, 2);
  } else if (outputFormat === 'txt') {
    content = `Player: ${playerName}\nRegion: ${region}\n\nPoints:\n- Fixed: ${pointsData.fixedPoints}\n- Season: ${pointsData.seasonPoints}\n\nMaps:\n`;
    enrichedMaps.forEach(map => {
      content += `- ${map.mapName}: ${map.time} (${map.lastFinish}) | Type: ${map.type}, Points: ${map.points}, Stars: ${map.stars}\n`;
    });
  } else {
    console.error(`Unsupported output format: ${outputFormat}`);
    return;
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Data saved to ${filePath}`);

  console.log(`NAME: ${playerName}, P: ${pointsData.fixedPoints}, PS: ${pointsData.seasonPoints}`);
  console.log(`TOTAL MAPS: ${enrichedMaps.length}`);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(query) {
  return new Promise(resolve => rl.question(query, answer => resolve(answer)));
}

(async () => {
  const playerName = await askQuestion('player name: ');
  const region = await askQuestion('region: ');
  const outputFormat = await askQuestion('format (json/txt): ');

  rl.close();

  await main(playerName, region, outputFormat);
})();
