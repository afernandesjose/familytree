#!/usr/bin/env node
'use strict';
/**
 * Hacesoft App Store assets – blokující kontrola lokálního sestavení.
 *
 * Vstupy:
 *   argv[2] = kořen projektu se src/ a docs/;
 *   argv[3] = volitelný kořen sestavené runtime aplikace;
 *   argv[4] = volitelný kořen veřejného full-source projektu.
 * Výstup: PASS pouze při shodě schválených hashů, XML metadat, PNG a SVG.
 * Veřejná HTTPS dostupnost je samostatná POST-PUBLISH kontrola.
 */
const nodeFs = require('node:fs');
const nodePath = require('node:path');
const nodeCrypto = require('node:crypto');
const nodeZlib = require('node:zlib');

const oRoot = nodePath.resolve(process.argv[2] || nodePath.join(__dirname, '..'));
const oRuntime = process.argv[3] ? nodePath.resolve(process.argv[3]) : null;
const oPublic = process.argv[4] ? nodePath.resolve(process.argv[4]) : null;
const aErrors = [];
const sConfigPath = nodePath.join(oRoot, 'scripts/appstore-approved-assets.json');
const nMaxScreenshotSize = 2 * 1024 * 1024;
let oManifest;
try {oManifest = JSON.parse(nodeFs.readFileSync(sConfigPath, 'utf8'));}
catch (oError) {process.stderr.write(`FAIL: Nelze načíst schválené grafické podklady: ${oError.message}\n`); process.exit(1);}

/** Bezpečně přečte soubor pouze z určeného kořene, bez symlinků a útěků mimo něj. */
function fReadFile(oBase, sRelative) {
  if (typeof sRelative !== 'string' || !/^[\w./-]+$/.test(sRelative) || sRelative.startsWith('/') || sRelative.split('/').includes('..'))
    throw new Error(`Neplatná relativní cesta: ${sRelative}`);
  const sFull = nodePath.resolve(oBase, sRelative);
  if (sFull === oBase || !sFull.startsWith(oBase + nodePath.sep)) throw new Error(`Cesta mimo projekt: ${sRelative}`);
  let sCurrent = oBase;
  for (const sPart of sRelative.split('/')) {
    sCurrent = nodePath.join(sCurrent, sPart);
    if (nodeFs.lstatSync(sCurrent).isSymbolicLink()) throw new Error(`Zakázaný symlink: ${sRelative}`);
  }
  if (!nodeFs.statSync(sFull).isFile()) throw new Error(`Chybí soubor: ${sRelative}`);
  return nodeFs.readFileSync(sFull);
}
/** Porovná obsah souboru s majitelem schváleným SHA-256. */
function fValidateHash(oBase, sRelative, sExpected) {
  const oBytes = fReadFile(oBase, sRelative);
  const sActual = nodeCrypto.createHash('sha256').update(oBytes).digest('hex');
  if (!/^[a-f0-9]{64}$/.test(sExpected) || sActual !== sExpected)
    throw new Error(`Neschválený či změněný obrázek ${sRelative}: SHA-256 ${sActual}, očekáváno ${sExpected}`);
  return oBytes;
}
/** Vrací CRC-32 pro kontrolu všech PNG chunků. */
function fCrc32(oBytes) {
  let nCrc = 0xffffffff;
  for (const nByte of oBytes) {
    nCrc ^= nByte;
    for (let nIndex = 0; nIndex < 8; nIndex++) nCrc = (nCrc >>> 1) ^ ((nCrc & 1) ? 0xedb88320 : 0);
  }
  return (nCrc ^ 0xffffffff) >>> 0;
}
/** Zkontroluje celou PNG strukturu a rozměry; nikdy obrázek nepřekóduje. */
function fValidatePng(oBytes, sName, oExpected) {
  if (!oBytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error(`${sName}: neplatná hlavička PNG`);
  if (oBytes.length > nMaxScreenshotSize && oExpected) throw new Error(`${sName}: screenshot překračuje 2 MiB`);
  let nPosition = 8; let bIHDR = false; let bIEND = false; let nIdat = 0;
  while (nPosition < oBytes.length) {
    if (nPosition + 12 > oBytes.length) throw new Error(`${sName}: poškozený PNG chunk`);
    const nLength = oBytes.readUInt32BE(nPosition);
    if (nLength > oBytes.length - nPosition - 12) throw new Error(`${sName}: uříznutý PNG chunk`);
    const sChunk = oBytes.toString('ascii', nPosition + 4, nPosition + 8);
    const nDataBegin = nPosition + 8; const nDataEnd = nDataBegin + nLength;
    const nCrc = oBytes.readUInt32BE(nDataEnd);
    if (fCrc32(oBytes.subarray(nPosition + 4, nDataEnd)) !== nCrc) throw new Error(`${sName}: chybné CRC v chunku ${sChunk}`);
    if (sChunk === 'IHDR') {
      if (bIHDR || nPosition !== 8 || nLength !== 13) throw new Error(`${sName}: neplatný IHDR`);
      bIHDR = true;
      const nWidth = oBytes.readUInt32BE(nDataBegin);
      const nHeight = oBytes.readUInt32BE(nDataBegin + 4);
      if (nWidth < 1 || nHeight < 1 || nWidth > 10000 || nHeight > 10000) throw new Error(`${sName}: neplatné rozměry PNG`);
      if (oExpected && (nWidth !== oExpected.width || nHeight !== oExpected.height))
        throw new Error(`${sName}: změněné rozměry ${nWidth}x${nHeight}`);
    }
    if (sChunk === 'IDAT') nIdat++;
    if (sChunk === 'IEND') {if (nLength !== 0) throw new Error(`${sName}: neplatný IEND`); bIEND = true; nPosition = nDataEnd + 4; break;}
    nPosition = nDataEnd + 4;
  }
  if (!bIHDR || !bIEND || !nIdat || nPosition !== oBytes.length) throw new Error(`${sName}: neúplný PNG soubor`);
}
/** Minimální striktní XML validace SVG bez doplňkových npm balíčků. */
function fValidateSvg(oBytes, sName) {
  const sXml = oBytes.toString('utf8');
  if (Buffer.from(sXml, 'utf8').compare(oBytes) !== 0) throw new Error(`${sName}: neplatné UTF-8`);
  if (/<!DOCTYPE|<!ENTITY|<script\b|<foreignObject\b|<iframe\b|\son[a-z]+\s*=|(?:href|xlink:href)\s*=\s*['"](?:https?:|data:|javascript:)/i.test(sXml))
    throw new Error(`${sName}: externí odkazy nebo aktivní SVG obsah`);
  const aTags = sXml.match(/<\?[^>]*\?>|<!--[^]*?-->|<!\[CDATA\[[^]*?\]\]>|<\/?[A-Za-z_][^>]*>/g) || [];
  const sRemaining = sXml.replace(/<\?[^>]*\?>|<!--[^]*?-->|<!\[CDATA\[[^]*?\]\]>|<\/?[A-Za-z_][^>]*>/g, '');
  if (sRemaining.includes('<') || sRemaining.includes('>')) throw new Error(`${sName}: neplatná XML syntaxe`);
  const aStack = []; let nRoots = 0;
  for (const sTag of aTags) {
    if (sTag.startsWith('<?') || sTag.startsWith('<!--') || sTag.startsWith('<![')) continue;
    const bEnd = sTag.startsWith('</');
    const sNameTag = sTag.match(/^<\/?([A-Za-z_][\w:.-]*)/)[1];
    if (bEnd) {
      if (!/^<\/[\w:.-]+\s*>$/.test(sTag) || aStack.pop() !== sNameTag) throw new Error(`${sName}: neuzavřená značka ${sNameTag}`);
    } else {
      if (!aStack.length) {nRoots++; if (sNameTag !== 'svg') throw new Error(`${sName}: kořenem není svg`);}
      if (!/\/$/.test(sTag.slice(0,-1))) aStack.push(sNameTag);
    }
  }
  if (nRoots !== 1 || aStack.length || !/<svg\s[^>]*xmlns\s*=\s*["']http:\/\/www\.w3\.org\/2000\/svg["']/.test(sXml))
    throw new Error(`${sName}: SVG není platně uzavřeno nebo chybí namespace`);
}
/** Jedinou kontrolu zabalí do konkrétní chyby; na konci se zastaví při kterémkoli FAIL. */
function fCheck(sLabel, fAction) {
  try {fAction(); process.stdout.write(`PASS: ${sLabel}\n`);}
  catch (oError) {aErrors.push(`${sLabel}: ${oError.message}`); process.stderr.write(`FAIL: ${sLabel}: ${oError.message}\n`);}
}

fCheck('ID aplikace a jedna schválená instalační ikona', () => {
  const sInfo=fReadFile(oRoot,'src/appinfo/info.xml').toString('utf8');
  const sAppId=(sInfo.match(/<id>([^<]+)<\/id>/)||[])[1];
  if(oManifest.schemaVersion!==1 || sAppId!==oManifest.appId || oManifest.sourceMode!=='external-github-screenshots')
    throw new Error('Neodpovídá schválený manifest pro externí screenshoty');
  if(oManifest.runtimeAssets.length!==1 || oManifest.runtimeAssets[0].source!=='src/img/app.svg' || oManifest.runtimeAssets[0].runtime!=='img/app.svg')
    throw new Error('V instalaci musí být jediná schválená ikona img/app.svg');
  if(!/<icon>app\.svg<\/icon>/.test(sInfo))throw new Error('Navigace nepoužívá app.svg');
});
fCheck('Originální schválená ikona v podkladech i distribuci',()=>{
  const oEntry=oManifest.runtimeAssets[0];
  const oBytes=fValidateHash(oRoot,oEntry.source,oEntry.sha256);fValidateSvg(oBytes,oEntry.source);
  if(oRuntime) {const oCopy=fValidateHash(oRuntime,'img/app.svg',oEntry.sha256);if(!oBytes.equals(oCopy))throw new Error('Runtime změnil schválenou ikonu');}
  if(oPublic) fValidateHash(oPublic,'src/img/app.svg',oEntry.sha256);
});
fCheck('Screenshoty nepatří do instalačního ani zdrojového ZIPu',()=>{
  const aExpected=['01.png','02.png','03.png'];
  if(oManifest.screenshots.length!==3 || oManifest.screenshots.map(e=>e.source).join('|')!==aExpected.map(x=>'screenshot/'+x).join('|'))
    throw new Error('Manifest musí používat jen vzdálené screenshot/01.png, 02.png, 03.png');
  for(const [sLabel,oFolder] of [['zdroj',oRoot],['runtime',oRuntime],['GitHub source',oPublic]]){
    if(!oFolder)continue;
    const oImg=nodePath.join(oFolder,sLabel==='runtime'?'img':'src/img');
    if(!nodeFs.existsSync(oImg)) throw new Error(`${sLabel}: chybí adresář s ikonou`);
    const aUnexpected=nodeFs.readdirSync(oImg).filter(x=>x.toLowerCase().endsWith('.png'));
    if(aUnexpected.length)throw new Error(`${sLabel}: PNG soubory v instalačním zdroji: ${aUnexpected.join(', ')}`);
    if(nodeFs.existsSync(nodePath.join(oFolder,'screenshot')) || nodeFs.existsSync(nodePath.join(oFolder,'screenshots')))
      throw new Error(`${sLabel}: samostatné screenshoty nesmějí být v archivu`);
  }
  if(nodeFs.existsSync(nodePath.join(oRoot,'docs/images/appstore')))throw new Error('Zastaralé duplicitní screenshoty');
});
fCheck('Schválené SHA-256 a rozměry veřejných screenshotů',()=>{
  for(const oEntry of oManifest.screenshots){
    if(!/^[a-f0-9]{64}$/.test(oEntry.sha256) || oEntry.width<1 || oEntry.height<1 || oEntry.width>10000 || oEntry.height>10000)
      throw new Error('Neplatné schválené parametry veřejného screenshotu');
    if(oEntry.runtime)throw new Error('Veřejný screenshot nesmí mít runtime cestu');
  }
});
fCheck('Tři správné přímé GitHub URL v info.xml',()=>{
  const oBytes=fReadFile(oRoot,'src/appinfo/info.xml');const sXml=oBytes.toString('utf8');
  const aFound=[...sXml.matchAll(/<screenshot(?:\s+small-thumbnail="([^"]+)")?\s*>([^<]+)<\/screenshot>/g)];
  if(aFound.length!==3)throw new Error('V metadatech musí být přesně tři screenshoty');
  const sBase='https://raw.githubusercontent.com/hacesoft/familytree/main/screenshot/';
  aFound.forEach((aMatch,nIndex)=>{
    const oEntry=oManifest.screenshots[nIndex];const sExpected=sBase+(nIndex+1+'').padStart(2,'0')+'.png';
    if(oEntry.url!==sExpected || aMatch[2]!==sExpected)throw new Error('Neplatná URL screenshotu #'+(nIndex+1));
    if(nIndex===0){
      if(aMatch[1]!==sExpected || oEntry.thumbnail?.url!==sExpected || oEntry.thumbnail?.sha256!==oEntry.sha256)
        throw new Error('Hlavní small-thumbnail musí být stejný screenshot');
    } else if(aMatch[1] || oEntry.thumbnail)throw new Error('Vedlejší screenshot nemá small-thumbnail');
  });
  if(oRuntime && !fReadFile(oRuntime,'appinfo/info.xml').equals(oBytes))throw new Error('Jiný info.xml v runtime');
  if(oPublic && !fReadFile(oPublic,'src/appinfo/info.xml').equals(oBytes))throw new Error('Jiný info.xml ve veřejných zdrojích');
});
fCheck('Obě README odkazují na externí screenshot v kořeni GitHubu',()=>{
  for(const sName of ['README.md','README_CZ.md']){
    const sText=fReadFile(oRoot,sName).toString('utf8');
    if(!sText.includes('](screenshot/01.png)'))throw new Error(`${sName} neodkazuje na screenshot/01.png`);
    if(oPublic && !fReadFile(oPublic,sName).equals(Buffer.from(sText)))throw new Error(`${sName} se liší`);
  }
});
if(aErrors.length){process.stderr.write(`BLOCKING: App Store asset checks: ${aErrors.length} chyb.\n`);process.exit(1);}
process.stdout.write('PASS: Schválená ikona, screenshot URL/manifest, nepřítomnost screenshotů v archivech.\n');
process.stdout.write('PENDING: veřejné PNG stáhnout a ověřit proti SHA-256 PŘED vydáním.\n');
