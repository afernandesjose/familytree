#!/usr/bin/env node
'use strict';
/**
 * Ověření veřejných URL z appinfo/info.xml po nahrání zdrojů na GitHub.
 * Vstup: kořen zdrojového projektu v argv[2], jinak nadřazená složka scripts/.
 * Výstup: PASS pouze při HTTP 200, PNG bajtech a shodě SHA-256 se schváleným originálem;
 *         FAIL při chybném spojení, přesměrování mimo HTTPS, chybě nebo změně obrazu.
 * Nepoužívat jako náhradu lokálního HDS testu: tato kontrola vyžaduje internet
 * a musí proběhnout až po zveřejnění veřejných souborů na uvedených URL.
 */
const oFs = require('node:fs');
const oPath = require('node:path');
const oHttps = require('node:https');
const oCrypto = require('node:crypto');
const oRoot = oPath.resolve(process.argv[2] || oPath.join(__dirname, '..'));
const oManifest = JSON.parse(oFs.readFileSync(oPath.join(oRoot, 'scripts/appstore-approved-assets.json'), 'utf8'));
const sXml = oFs.readFileSync(oPath.join(oRoot, 'src/appinfo/info.xml'), 'utf8');
const nMax = 2 * 1024 * 1024;
/** Vrátí obsah HTTPS URL s limitem velikosti, času a přesměrování. */
function fDownload(sUrl, nRedirects=0) {
  return new Promise((fResolve, fReject) => {
    if (nRedirects > 2) return fReject(new Error('Příliš mnoho přesměrování'));
    const oUrl = new URL(sUrl);
    if (oUrl.protocol !== 'https:' || oUrl.hostname !== 'raw.githubusercontent.com') return fReject(new Error('Nepovolené cílové URL'));
    const oRequest = oHttps.get(oUrl, {headers:{'User-Agent':'Hacesoft-Publisher-AppStore-AssetAudit/1.0','Accept':'image/png'}}, oResponse => {
      if (oResponse.statusCode === 301 || oResponse.statusCode === 302 || oResponse.statusCode === 307 || oResponse.statusCode === 308) {
        const sTarget = new URL(oResponse.headers.location || '', sUrl).href;
        oResponse.resume();
        fDownload(sTarget, nRedirects+1).then(fResolve, fReject);
        return;
      }
      if (oResponse.statusCode !== 200) {
        oResponse.resume(); fReject(new Error(`HTTP ${oResponse.statusCode}`)); return;
      }
      const aData = [];let nSize = 0;
      oResponse.on('data', oChunk => {
        nSize += oChunk.length;
        if (nSize > nMax) {oRequest.destroy(new Error('Obrázek překračuje 2 MiB'));return;}
        aData.push(oChunk);
      });
      oResponse.on('end', () => fResolve({oBytes:Buffer.concat(aData),sContentType:String(oResponse.headers['content-type']||'')}));
      oResponse.on('error', fReject);
    });
    oRequest.setTimeout(10000,()=>oRequest.destroy(new Error('Časový limit 10 s')));
    oRequest.on('error',fReject);
  });
}
/** Ověří jednu schválenou screenshot URL přes internet. */
async function fCheck(oEntry) {
  const sExpected = oEntry.url;
  if (!sXml.includes('>'+sExpected+'</screenshot>')) throw new Error('URL není deklarována v appinfo/info.xml');
  const {oBytes,sContentType} = await fDownload(sExpected);
  if (!/^image\/png\b/i.test(sContentType)) throw new Error(`Nesprávný Content-Type ${sContentType}`);
  if (!oBytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('Neplatný PNG');
  const sHash = oCrypto.createHash('sha256').update(oBytes).digest('hex');
  if (sHash !== oEntry.sha256) throw new Error(`Zveřejněn jiný obrázek SHA-256=${sHash}`);
  if (oBytes.readUInt32BE(16)!==oEntry.width || oBytes.readUInt32BE(20)!==oEntry.height) throw new Error('Nesprávné rozměry obrázku');
  process.stdout.write(`PASS: PUBLIC URL ${oEntry.source} HTTP 200, PNG, SHA-256 OK\n`);
}
(async () => {
  let nErrors=0;
  for (const oEntry of oManifest.screenshots) {
    try {await fCheck(oEntry);} catch (oError) {nErrors++;process.stderr.write(`FAIL: ${oEntry.url}: ${oError.message}\n`);}
  }
  if (nErrors>0) {process.stderr.write(`BLOCKING: ${nErrors} veřejných obrázků neprošlo kontrolou. Nepublikovat do App Storu.\n`);process.exitCode=1;}
  else process.stdout.write(`PASS: Všechny ${oManifest.screenshots.length} veřejné screenshoty jsou skutečně dostupné a shodné.\n`);
})().catch(oError=>{process.stderr.write(`FAIL: ${oError.message}\n`);process.exitCode=1;});
