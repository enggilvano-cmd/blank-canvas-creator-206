#!/usr/bin/env node

/**
 * Script para gerar arquivo de versão durante o build
 * Isso permite que o PWA detecte atualizações comparando versões
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const versionFilePath = path.join(__dirname, '../public/version.json');

function generateVersion() {
  // Gerar versão baseada no package.json ou timestamp
  const packageJsonPath = path.join(__dirname, '../package.json');
  let version = '1.0.0';

  try {
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      version = packageJson.version || '1.0.0';
    }
  } catch (error) {
    console.warn('Não foi possível ler a versão do package.json:', error instanceof Error ? error.message : error);
  }

  const versionData = {
    version: version,
    buildTime: new Date().toISOString(),
    appName: 'Planiflow',
    buildNumber: process.env.BUILD_NUMBER || 'local',
  };

  try {
    fs.writeFileSync(versionFilePath, JSON.stringify(versionData, null, 2));
    console.log(`✅ Arquivo de versão gerado: ${versionFilePath}`);
    console.log(`   Versão: ${version}`);
    console.log(`   Build Time: ${versionData.buildTime}`);
  } catch (error) {
    console.error('❌ Erro ao gerar arquivo de versão:', error);
    process.exit(1);
  }
}

generateVersion();
