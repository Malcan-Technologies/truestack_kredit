/**
 * PDF Calibration Script
 * 
 * This script generates calibration PDFs to help map the exact coordinates
 * for filling in the Jadual J and Jadual K loan agreement templates.
 * 
 * Usage:
 *   cd apps/backend
 *   npx tsx scripts/calibrate-pdf.ts              # Both templates
 *   npx tsx scripts/calibrate-pdf.ts jadual-j     # Jadual J only
 *   npx tsx scripts/calibrate-pdf.ts jadual-k     # Jadual K only
 * 
 * Output:
 *   - calibration-grid-j.pdf / calibration-grid-k.pdf - Template with grid overlay
 *   - test-agreement-j.pdf / test-agreement-k.pdf - Sample filled agreement
 */

import fs from 'fs/promises';
import path from 'path';
import { generateCalibrationPdf, generateTestAgreement } from '../src/lib/pdfService.js';

type Template = 'jadual-j' | 'jadual-k';

async function generateForTemplate(template: Template, outputDir: string) {
  const suffix = template === 'jadual-k' ? 'k' : 'j';
  const label = template === 'jadual-k' ? 'Jadual K' : 'Jadual J';
  
  // Generate calibration PDF with grid
  console.log(`\n--- ${label} ---`);
  console.log(`  1. Generating ${label} calibration grid PDF...`);
  try {
    const calibrationPdf = await generateCalibrationPdf(template);
    const calibrationPath = path.join(outputDir, `calibration-grid-${suffix}.pdf`);
    await fs.writeFile(calibrationPath, calibrationPdf);
    console.log(`     ✓ Saved to: ${calibrationPath}`);
  } catch (error) {
    console.error(`     ✗ Failed to generate ${label} calibration PDF:`, error);
  }
  
  // Generate test agreement
  console.log(`  2. Generating ${label} test agreement PDF...`);
  try {
    const testPdf = await generateTestAgreement(template);
    const testPath = path.join(outputDir, `test-agreement-${suffix}.pdf`);
    await fs.writeFile(testPath, testPdf);
    console.log(`     ✓ Saved to: ${testPath}`);
  } catch (error) {
    console.error(`     ✗ Failed to generate ${label} test agreement:`, error);
  }
}

async function main() {
  console.log('PDF Calibration Script');
  console.log('======================');
  
  const outputDir = path.join(process.cwd(), 'output');
  
  // Create output directory if it doesn't exist
  try {
    await fs.mkdir(outputDir, { recursive: true });
  } catch {
    // Directory already exists
  }
  
  // Parse CLI argument to select template
  const arg = process.argv[2]?.toLowerCase();
  
  if (arg === 'jadual-j' || arg === 'j') {
    await generateForTemplate('jadual-j', outputDir);
  } else if (arg === 'jadual-k' || arg === 'k') {
    await generateForTemplate('jadual-k', outputDir);
  } else {
    // Generate both
    await generateForTemplate('jadual-j', outputDir);
    await generateForTemplate('jadual-k', outputDir);
  }
  
  console.log('\n======================');
  console.log('Calibration Complete!');
  console.log('\nNext Steps:');
  console.log('1. Open calibration-grid-j.pdf or calibration-grid-k.pdf to see the coordinate grid');
  console.log('2. Red dots mark current configured field positions');
  console.log('3. Measure the exact coordinates for each blank field');
  console.log('4. Update JADUAL_PERTAMA_FIELDS or JADUAL_K_FIELDS in src/lib/pdfService.ts');
  console.log('5. Run this script again and check the test-agreement PDFs');
  console.log('6. Repeat until all fields are correctly positioned');
}

main().catch(console.error);
