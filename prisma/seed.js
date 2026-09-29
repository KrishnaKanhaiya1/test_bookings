/**
 * @file Database seed script for EVE Healthcare.
 * Populates initial diagnostic centres, diagnostic tests, centre-test pricing associations,
 * and a default test user within an atomic transaction.
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

/**
 * Seed data definition for 5 Diagnostic Centres
 */
const centresData = [
  {
    name: 'City Diagnostics Hub',
    address: '101 MG Road',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400001',
    phone: '+91-22-12345678',
    isActive: true,
  },
  {
    name: 'MedScan Laboratories',
    address: '45 Connaught Place',
    city: 'New Delhi',
    state: 'Delhi',
    pincode: '110001',
    phone: '+91-11-23456789',
    isActive: true,
  },
  {
    name: 'HealthFirst Diagnostics',
    address: '78 Brigade Road',
    city: 'Bangalore',
    state: 'Karnataka',
    pincode: '560001',
    phone: '+91-80-34567890',
    isActive: true,
  },
  {
    name: 'CarePoint Medical Centre',
    address: '23 Anna Salai',
    city: 'Chennai',
    state: 'Tamil Nadu',
    pincode: '600002',
    phone: '+91-44-45678901',
    isActive: true,
  },
  {
    name: 'LifeLine Diagnostics',
    address: '56 Banjara Hills',
    city: 'Hyderabad',
    state: 'Telangana',
    pincode: '500034',
    phone: '+91-40-56789012',
    isActive: true,
  },
];

/**
 * Seed data definition for 10 Diagnostic Tests
 */
const testsData = [
  {
    testCode: 'CBC001',
    name: 'Complete Blood Count (CBC)',
    description: 'Measures red/white blood cells and platelets',
  },
  {
    testCode: 'LPD001',
    name: 'Lipid Profile',
    description: 'Cholesterol and triglyceride levels',
  },
  {
    testCode: 'TFT001',
    name: 'Thyroid Function Test',
    description: 'TSH, T3, T4 hormone levels',
  },
  {
    testCode: 'LFT001',
    name: 'Liver Function Test',
    description: 'Liver enzyme and protein levels',
  },
  {
    testCode: 'KFT001',
    name: 'Kidney Function Test',
    description: 'Creatinine, BUN, and electrolytes',
  },
  {
    testCode: 'BSF001',
    name: 'Blood Sugar Fasting',
    description: 'Fasting blood glucose level',
  },
  {
    testCode: 'HBA001',
    name: 'HbA1c',
    description: 'Average blood sugar over 3 months',
  },
  {
    testCode: 'VTD001',
    name: 'Vitamin D',
    description: '25-hydroxy vitamin D levels',
  },
  {
    testCode: 'VTB001',
    name: 'Vitamin B12',
    description: 'Serum vitamin B12 concentration',
  },
  {
    testCode: 'COV001',
    name: 'COVID-19 RT-PCR',
    description: 'SARS-CoV-2 viral RNA detection',
  },
];

/**
 * Centre-Test pricing mapping (testCode -> price in INR)
 * Centre 1 (Mumbai): CBC=400, Lipid=800, Thyroid=600, Liver=700, Kidney=900, Sugar=150, HbA1c=550, VitD=1200, VitB12=900, COVID=500
 * Centre 2 (Delhi): CBC=350, Lipid=750, Thyroid=550, Liver=650, Sugar=120, HbA1c=500, VitD=1100
 * Centre 3 (Bangalore): CBC=450, Lipid=850, Thyroid=650, Kidney=950, Sugar=160, VitD=1300, VitB12=950, COVID=600
 * Centre 4 (Chennai): CBC=380, Lipid=780, Liver=680, Kidney=880, HbA1c=520, VitB12=850
 * Centre 5 (Hyderabad): CBC=360, Thyroid=580, Liver=660, Sugar=130, HbA1c=480, VitD=1050, COVID=450
 */
const pricingMapping = {
  'City Diagnostics Hub': {
    CBC001: '400.00',
    LPD001: '800.00',
    TFT001: '600.00',
    LFT001: '700.00',
    KFT001: '900.00',
    BSF001: '150.00',
    HBA001: '550.00',
    VTD001: '1200.00',
    VTB001: '900.00',
    COV001: '500.00',
  },
  'MedScan Laboratories': {
    CBC001: '350.00',
    LPD001: '750.00',
    TFT001: '550.00',
    LFT001: '650.00',
    BSF001: '120.00',
    HBA001: '500.00',
    VTD001: '1100.00',
  },
  'HealthFirst Diagnostics': {
    CBC001: '450.00',
    LPD001: '850.00',
    TFT001: '650.00',
    KFT001: '950.00',
    BSF001: '160.00',
    VTD001: '1300.00',
    VTB001: '950.00',
    COV001: '600.00',
  },
  'CarePoint Medical Centre': {
    CBC001: '380.00',
    LPD001: '780.00',
    LFT001: '680.00',
    KFT001: '880.00',
    HBA001: '520.00',
    VTB001: '850.00',
  },
  'LifeLine Diagnostics': {
    CBC001: '360.00',
    TFT001: '580.00',
    LFT001: '660.00',
    BSF001: '130.00',
    HBA001: '480.00',
    VTD001: '1050.00',
    COV001: '450.00',
  },
};

/**
 * Seeds the database with initial diagnostic centres, tests, centre-test pricing, and a test user.
 * Wraps all cleanup and seed insertions within an atomic transaction.
 *
 * @returns {Promise<void>}
 */
async function seed() {
  console.log('--- Starting Database Seeding ---');

  // Precompute password hash with 12 salt rounds before entering transaction
  // to avoid keeping database transaction locks open during CPU-intensive hashing.
  const saltRounds = 12;
  const passwordHash = await bcrypt.hash('password123', saltRounds);

  // Wrap all operations in an atomic transaction to guarantee consistency
  await prisma.$transaction(async (tx) => {
    // Step 1: Delete existing records in child-to-parent order to respect foreign key constraints
    console.log('Cleaning up existing database records...');
    await tx.webhookEvent.deleteMany();
    await tx.payment.deleteMany();
    await tx.booking.deleteMany();
    await tx.centreTest.deleteMany();
    await tx.diagnosticTest.deleteMany();
    await tx.diagnosticCentre.deleteMany();
    await tx.user.deleteMany();
    console.log('✓ Successfully cleared existing tables.');

    // Step 2: Seed test user
    console.log('Seeding test user...');
    const user = await tx.user.create({
      data: {
        email: 'test@example.com',
        fullName: 'Test User',
        passwordHash,
        isActive: true,
      },
    });
    console.log(`✓ Test user created: ${user.email} (ID: ${user.id})`);

    // Step 3: Seed diagnostic centres
    console.log('Seeding diagnostic centres...');
    const createdCentres = {};
    for (const centre of centresData) {
      const created = await tx.diagnosticCentre.create({
        data: centre,
      });
      createdCentres[created.name] = created;
    }
    console.log(`✓ Seeded ${Object.keys(createdCentres).length} diagnostic centres.`);

    // Step 4: Seed diagnostic tests
    console.log('Seeding diagnostic tests...');
    const createdTests = {};
    for (const test of testsData) {
      const created = await tx.diagnosticTest.create({
        data: test,
      });
      createdTests[created.testCode] = created;
    }
    console.log(`✓ Seeded ${Object.keys(createdTests).length} diagnostic tests.`);

    // Step 5: Seed centre-test associations with pricing
    console.log('Seeding centre-test associations with pricing...');
    let centreTestCount = 0;
    for (const [centreName, testPricing] of Object.entries(pricingMapping)) {
      const centre = createdCentres[centreName];
      if (!centre) {
        throw new Error(`Centre not found during association seeding: ${centreName}`);
      }

      for (const [testCode, price] of Object.entries(testPricing)) {
        const test = createdTests[testCode];
        if (!test) {
          throw new Error(`Test code not found during association seeding: ${testCode}`);
        }

        await tx.centreTest.create({
          data: {
            centreId: centre.id,
            testId: test.id,
            price,
            isAvailable: true,
          },
        });
        centreTestCount++;
      }
    }
    console.log(`✓ Seeded ${centreTestCount} centre-test pricing associations.`);
  });

  console.log('--- Database Seeding Completed Successfully ---');
}

// Execute seed if invoked directly via CLI (e.g., node prisma/seed.js)
if (require.main === module) {
  seed()
    .catch((error) => {
      console.error('Database seeding failed:', error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

module.exports = { seed };
