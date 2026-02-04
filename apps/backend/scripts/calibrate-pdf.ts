/**
 * PDF Calibration Script
 * 
 * This script generates calibration PDFs to help map the exact coordinates
 * for filling in the Jadual J loan agreement template.
 * 
 * Usage:
 *   cd apps/backend
 *   npx tsx scripts/calibrate-pdf.ts
 * 
 * Output:
 *   - calibration-grid.pdf - Template with grid overlay for coordinate mapping
 *   - test-agreement.pdf - Sample filled agreement to verify field positions
 */

import fs from 'fs/promises';
import path from 'path';
import { generateCalibrationPdf, generateTestAgreement } from '../src/lib/pdfService.js';

async function main() {
  console.log('PDF Calibration Script');
  console.log('======================\n');
  
  const outputDir = path.join(process.cwd(), 'output');
  
  // Create output directory if it doesn't exist
  try {
    await fs.mkdir(outputDir, { recursive: true });
  } catch {
    // Directory already exists
  }
  
  // Generate calibration PDF with grid
  console.log('1. Generating calibration grid PDF...');
  try {
    const calibrationPdf = await generateCalibrationPdf();
    const calibrationPath = path.join(outputDir, 'calibration-grid.pdf');
    await fs.writeFile(calibrationPath, calibrationPdf);
    console.log(`   ✓ Saved to: ${calibrationPath}`);
  } catch (error) {
    console.error('   ✗ Failed to generate calibration PDF:', error);
  }
  
  // Generate test agreement
  console.log('2. Generating test agreement PDF...');
  try {
    const testPdf = await generateTestAgreement();
    const testPath = path.join(outputDir, 'test-agreement.pdf');
    await fs.writeFile(testPath, testPdf);
    console.log(`   ✓ Saved to: ${testPath}`);
  } catch (error) {
    console.error('   ✗ Failed to generate test agreement:', error);
  }
  
  console.log('\n======================');
  console.log('Calibration Complete!');
  console.log('\nNext Steps:');
  console.log('1. Open calibration-grid.pdf to see the coordinate grid');
  console.log('2. Page 5 (index 4) contains Jadual Pertama with field markers');
  console.log('3. Measure the exact coordinates for each blank field');
  console.log('4. Update JADUAL_PERTAMA_FIELDS in src/lib/pdfService.ts');
  console.log('5. Run this script again and check test-agreement.pdf');
  console.log('6. Repeat until all fields are correctly positioned');
}

main().catch(console.error);
