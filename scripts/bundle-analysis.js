/**
 * Bundle Analysis Script
 * Analyzes build output and generates optimization recommendations
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const buildDir = path.join(__dirname, '../dist');

class BundleAnalysisScript {
  constructor() {
    this.files = [];
  }
  
  async analyze() {
    console.log('📊 Starting bundle analysis...\n');
    
    try {
      await this.scanBuildDirectory();
      this.categorizeFiles();
      this.generateReport();
      this.generateOptimizationRecommendations();
    } catch (error) {
      console.error('❌ Bundle analysis failed:', error);
      process.exit(1);
    }
  }

  async scanBuildDirectory() {
    try {
      const exists = await fs.access(buildDir).then(() => true).catch(() => false);
      if (!exists) {
        console.log('⚠️ Build directory not found. Run `npm run build` first.');
        process.exit(1);
      }

      await this.scanDirectory(buildDir);
      console.log(`📁 Scanned ${this.files.length} files\n`);
    } catch (error) {
      throw new Error(`Failed to scan build directory: ${error}`);
    }
  }

  async scanDirectory(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        await this.scanDirectory(fullPath);
      } else {
        const stats = await fs.stat(fullPath);
        const relativePath = path.relative(buildDir, fullPath);
        
        this.files.push({
          file: relativePath,
          size: stats.size,
          sizeKB: Math.round(stats.size / 1024 * 10) / 10,
          type: this.getFileType(entry.name),
          isChunk: entry.name.includes('chunk') || entry.name.includes('lazy'),
          isVendor: entry.name.includes('vendor') || entry.name.includes('node_modules')
        });
      }
    }
  }

  getFileType(filename) {
    const ext = path.extname(filename).toLowerCase();
    switch (ext) {
      case '.js': case '.mjs': return 'js';
      case '.css': return 'css';
      case '.html': return 'html';
      default: return 'asset';
    }
  }

  categorizeFiles() {
    // Sort files by size (largest first)
    this.files.sort((a, b) => b.size - a.size);
  }

  generateReport() {
    const jsFiles = this.files.filter(f => f.type === 'js');
    const cssFiles = this.files.filter(f => f.type === 'css');
    const assetFiles = this.files.filter(f => f.type === 'asset');
    
    const totalSize = this.files.reduce((sum, f) => sum + f.size, 0);
    const jsSize = jsFiles.reduce((sum, f) => sum + f.size, 0);
    const cssSize = cssFiles.reduce((sum, f) => sum + f.size, 0);
    const assetSize = assetFiles.reduce((sum, f) => sum + f.size, 0);

    console.log('📈 BUNDLE ANALYSIS REPORT');
    console.log('=' .repeat(50));
    console.log(`📦 Total Bundle Size: ${(totalSize / 1024).toFixed(1)}KB`);
    console.log(`🟨 JavaScript: ${(jsSize / 1024).toFixed(1)}KB (${((jsSize/totalSize)*100).toFixed(1)}%)`);
    console.log(`🟦 CSS: ${(cssSize / 1024).toFixed(1)}KB (${((cssSize/totalSize)*100).toFixed(1)}%)`);
    console.log(`🟩 Assets: ${(assetSize / 1024).toFixed(1)}KB (${((assetSize/totalSize)*100).toFixed(1)}%)`);
    console.log();

    // JavaScript files breakdown
    console.log('📄 JAVASCRIPT FILES (Top 10)');
    console.log('-'.repeat(50));
    jsFiles.slice(0, 10).forEach((file, index) => {
      const icon = file.isVendor ? '📚' : file.isChunk ? '🧩' : '📄';
      const type = file.isVendor ? 'vendor' : file.isChunk ? 'chunk' : 'main';
      console.log(`${index + 1}. ${icon} ${file.file} - ${file.sizeKB}KB (${type})`);
    });
    console.log();

    // Chunk analysis
    const chunks = jsFiles.filter(f => f.isChunk);
    const vendorFiles = jsFiles.filter(f => f.isVendor);
    
    console.log('🧩 CODE SPLITTING ANALYSIS');
    console.log('-'.repeat(50));
    console.log(`🎯 Total Chunks: ${chunks.length}`);
    console.log(`📚 Vendor Chunks: ${vendorFiles.length}`);
    console.log(`⚡ Lazy Chunks: ${chunks.filter(f => f.file.includes('lazy')).length}`);
    console.log(`📊 Average Chunk Size: ${chunks.length > 0 ? (chunks.reduce((sum, f) => sum + f.sizeKB, 0) / chunks.length).toFixed(1) : 0}KB`);
    console.log();
  }

  generateOptimizationRecommendations() {
    const recommendations = [];
    const jsFiles = this.files.filter(f => f.type === 'js');
    const totalJSSize = jsFiles.reduce((sum, f) => sum + f.size, 0);
    
    console.log('💡 OPTIMIZATION RECOMMENDATIONS');
    console.log('=' .repeat(50));

    // Check bundle size
    if (totalJSSize > 500 * 1024) { // > 500KB
      recommendations.push('🚨 JavaScript bundle is large (>500KB)');
      recommendations.push('   • Consider more aggressive code splitting');
      recommendations.push('   • Enable tree shaking for unused exports');
      recommendations.push('   • Use dynamic imports for heavy components');
    }

    // Check chunk distribution
    const chunks = jsFiles.filter(f => f.isChunk);
    const largeChunks = chunks.filter(f => f.size > 100 * 1024); // > 100KB
    if (largeChunks.length > 0) {
      recommendations.push(`📦 ${largeChunks.length} chunks are >100KB`);
      recommendations.push('   • Split large chunks into smaller pieces');
      largeChunks.forEach(chunk => {
        recommendations.push(`   • ${chunk.file} (${chunk.sizeKB}KB)`);
      });
    }

    // Check vendor optimization
    const vendorFiles = jsFiles.filter(f => f.isVendor);
    const totalVendorSize = vendorFiles.reduce((sum, f) => sum + f.size, 0);
    if (totalVendorSize > 300 * 1024) { // > 300KB
      recommendations.push('📚 Vendor bundle is large (>300KB)');
      recommendations.push('   • Consider splitting vendors by usage frequency');
      recommendations.push('   • Use CDN for common libraries');
    }

    // Check for missing compression
    const uncompressedEstimate = totalJSSize * 3; // Rough estimate
    recommendations.push('🗜️ Enable gzip/brotli compression');
    recommendations.push(`   • Potential savings: ~${((uncompressedEstimate - totalJSSize) / 1024).toFixed(0)}KB`);

    // Bundle optimization suggestions
    recommendations.push('');
    recommendations.push('⚡ QUICK WINS');
    recommendations.push('   • Use webp/avif for images');
    recommendations.push('   • Enable service worker caching'); 
    recommendations.push('   • Implement critical CSS inlining');
    recommendations.push('   • Add preload hints for critical resources');

    // Performance budget
    const performanceBudget = 250; // 250KB target
    const currentMainBundle = jsFiles.find(f => !f.isChunk && !f.isVendor);
    if (currentMainBundle && currentMainBundle.sizeKB > performanceBudget) {
      recommendations.push('');
      recommendations.push('🎯 PERFORMANCE BUDGET');
      recommendations.push(`   • Target: ${performanceBudget}KB for main bundle`);
      recommendations.push(`   • Current: ${currentMainBundle.sizeKB}KB`);
      recommendations.push(`   • Over budget by: ${(currentMainBundle.sizeKB - performanceBudget).toFixed(1)}KB`);
    }

    // Print recommendations
    if (recommendations.length > 0) {
      recommendations.forEach(rec => console.log(rec));
    } else {
      console.log('✅ Bundle is well optimized!');
    }

    console.log();
    console.log('🏆 OPTIMIZATION SCORE');
    console.log('-'.repeat(50));
    
    const score = this.calculateOptimizationScore();
    const scoreColor = score >= 80 ? '🟢' : score >= 60 ? '🟡' : '🔴';
    console.log(`${scoreColor} Score: ${score}/100`);
    
    if (score >= 80) {
      console.log('🎉 Excellent! Your bundle is well optimized.');
    } else if (score >= 60) {
      console.log('👍 Good, but there is room for improvement.');
    } else {
      console.log('⚠️ Bundle needs optimization.');
    }
  }

  calculateOptimizationScore() {
    const jsFiles = this.files.filter(f => f.type === 'js');
    const totalJSSize = jsFiles.reduce((sum, f) => sum + f.size, 0);
    const chunks = jsFiles.filter(f => f.isChunk);
    
    let score = 100;
    
    // Penalty for large bundle size
    if (totalJSSize > 500 * 1024) score -= 30;
    else if (totalJSSize > 300 * 1024) score -= 15;
    
    // Penalty for lack of code splitting
    if (chunks.length < 3) score -= 20;
    else if (chunks.length < 5) score -= 10;
    
    // Penalty for large chunks
    const largeChunks = chunks.filter(f => f.size > 100 * 1024);
    score -= largeChunks.length * 10;
    
    // Bonus for good chunk distribution
    if (chunks.length >= 5 && largeChunks.length === 0) score += 5;
    
    return Math.max(0, Math.min(100, score));
  }
}

// Run analysis
const analyzer = new BundleAnalysisScript();
analyzer.analyze();