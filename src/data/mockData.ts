import { MeasureData, GridRow } from '../types';
import { IndustryType } from '../contexts/IndustryContext';
import { consumerGoodsData } from './consumerGoodsData';
import { deepHierarchyData, sumValues } from './deepHierarchyData';
import { acmeHierarchyData } from './acmeHierarchyData';
import { deriveWeekValues } from '../utils/weekColumns';
import { withForecastAsSum } from '../utils/deriveForecast';
import {
  isConfigIndustry,
  getConfigMockData,
  isPristineOotbAccountPlanning,
  getConfigTopLevelValues,
} from './planConfigGridData';

const H1_MONTHS = ['jan2026', 'feb2026', 'mar2026', 'apr2026', 'may2026', 'jun2026'];
const H2_MONTHS = ['jul2026', 'aug2026', 'sep2026', 'oct2026', 'nov2026', 'dec2026'];

/** Derive half-year aggregates (H1 = Jan–Jun, H2 = Jul–Dec) from the month values. */
export const deriveHalfYearValues = (values: Record<string, number>): void => {
  values.h1 = H1_MONTHS.reduce((sum, mk) => sum + Number(values[mk] ?? 0), 0);
  values.h2 = H2_MONTHS.reduce((sum, mk) => sum + Number(values[mk] ?? 0), 0);
};

// Ensure every node in a measure tree carries weekly + half-year columns (derived from months).
const ensureWeekValues = (rows: (MeasureData | GridRow)[]): void => {
  rows.forEach((r) => {
    deriveWeekValues(r.values as Record<string, number>);
    deriveHalfYearValues(r.values as Record<string, number>);
    if (r.children && r.children.length) ensureWeekValues(r.children);
  });
};

const monthlyValue = (base: number) => {
  const monthFactors = {
    jan2026: 0.96,
    feb2026: 1.01,
    mar2026: 1.03,
    apr2026: 0.98,
    may2026: 1.00,
    jun2026: 1.02,
    jul2026: 0.99,
    aug2026: 1.04,
    sep2026: 0.97,
    oct2026: 1.01,
    nov2026: 1.00,
    dec2026: 0.99,
  } as const;
  const months = {
    jan2026: Math.round(base * monthFactors.jan2026),
    feb2026: Math.round(base * monthFactors.feb2026),
    mar2026: Math.round(base * monthFactors.mar2026),
    apr2026: Math.round(base * monthFactors.apr2026),
    may2026: Math.round(base * monthFactors.may2026),
    jun2026: Math.round(base * monthFactors.jun2026),
    jul2026: Math.round(base * monthFactors.jul2026),
    aug2026: Math.round(base * monthFactors.aug2026),
    sep2026: Math.round(base * monthFactors.sep2026),
    oct2026: Math.round(base * monthFactors.oct2026),
    nov2026: Math.round(base * monthFactors.nov2026),
    dec2026: Math.round(base * monthFactors.dec2026),
  };
  
  // Calculate quarters
  const q1 = months.jan2026 + months.feb2026 + months.mar2026;
  const q2 = months.apr2026 + months.may2026 + months.jun2026;
  const q3 = months.jul2026 + months.aug2026 + months.sep2026;
  const q4 = months.oct2026 + months.nov2026 + months.dec2026;
  
  // Calculate year (sum of all months)
  const year = q1 + q2 + q3 + q4;
  
  return {
    year,
    h1: q1 + q2,
    h2: q3 + q4,
    q1,
    q2,
    q3,
    q4,
    ...months,
  };
};

const seededRandom = (seed: string): number => {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(33, h) ^ seed.charCodeAt(i)) >>> 0;
  }
  return h / 4294967296;
};

// Account-level profile: intentionally extreme and non-uniform variance for heat-map demos.
const accountMonthlyValue = (base: number, seed: string) => {
  // SA Revenue accounts: carefully calibrated factors so the variance rule
  // shows a natural mix of green (< 1%), yellow (1–2 %), and red (> 2 %) cells.
  // All factor sets sum to 12.0 → mean = 1.0, so thresholds are exact.
  // Green factors: 0.88, 0.91, 0.946, 0.96  (variance < –1 %)
  // Yellow factors: 1.012, 1.015, 1.018, 1.019  (variance +1–2 %)
  // Red factors: 1.03, 1.05, 1.07, 1.09  (variance > +2 %)
  if (seed.includes('measure-sa-rev-')) {
    // Each account has a distinct seasonal profile so a different account leads each month.
    // Verified absolute values (base × scale × factor):
    //   mich=112k, texas=100k, ohio=88k, cal=72k, ill=68k, geo=60k
    // Jan→Michigan(157k), Feb→Texas(165k), Mar→Ohio(149k), Apr→California(126k),
    // May→Georgia(111k), Jun→Georgia(114k), Jul→Illinois(122k), Aug→California(126k),
    // Sep→Texas(160k), Oct→Michigan(168k), Nov→Ohio(152k), Dec→Michigan(179k)
    const SA_REV_FACTORS: Record<string, number[]> = {
      //                jan    feb    mar    apr    may    jun    jul    aug    sep    oct    nov    dec
      mich:  [1.40,  0.58,  0.65,  0.44,  0.42,  0.45,  0.55,  0.50,  0.62,  1.50,  0.75,  1.60],
      ohio:  [0.62,  0.72,  1.69,  0.68,  0.52,  0.55,  0.68,  0.62,  0.72,  0.58,  1.73,  0.65],
      texas: [0.65,  1.65,  0.70,  0.88,  0.60,  0.65,  0.58,  0.68,  1.60,  0.70,  0.60,  0.72],
      cal:   [0.58,  0.62,  0.68,  1.75,  0.70,  0.75,  0.65,  1.75,  0.78,  0.55,  0.68,  0.62],
      geo:   [0.55,  0.58,  0.55,  0.68,  1.85,  1.90,  0.68,  0.62,  0.58,  0.58,  0.55,  0.58],
      ill:   [0.58,  0.62,  0.68,  0.62,  0.68,  0.58,  1.80,  0.58,  0.62,  0.65,  0.62,  0.65],
    };
    const accKey = Object.keys(SA_REV_FACTORS).find(k => seed.includes(`-${k}`)) ?? 'mich';
    const factors = SA_REV_FACTORS[accKey];
    const monthKeys = [
      'jan2026', 'feb2026', 'mar2026', 'apr2026', 'may2026', 'jun2026',
      'jul2026', 'aug2026', 'sep2026', 'oct2026', 'nov2026', 'dec2026',
    ] as const;
    const months = monthKeys.reduce((acc, monthKey, idx) => {
      acc[monthKey] = Math.round(base * factors[idx]);
      return acc;
    }, {} as Record<typeof monthKeys[number], number>);
    const q1 = months.jan2026 + months.feb2026 + months.mar2026;
    const q2 = months.apr2026 + months.may2026 + months.jun2026;
    const q3 = months.jul2026 + months.aug2026 + months.sep2026;
    const q4 = months.oct2026 + months.nov2026 + months.dec2026;
    const year = q1 + q2 + q3 + q4;
    return { year, h1: q1 + q2, h2: q3 + q4, q1, q2, q3, q4, ...months };
  }

  // Demo profile: make one visible SA Qty account highly volatile so PM demos
  // show strong heat-map contrast immediately.
  if (seed.includes('measure-sa-qty-mich')) {
    const forcedFactors = [0.38, 1.62, 0.44, 1.58, 0.52, 1.46, 0.57, 1.69, 0.61, 1.48, 0.54, 1.36];
    const forcedMonths = {
      jan2026: Math.round(base * forcedFactors[0]),
      feb2026: Math.round(base * forcedFactors[1]),
      mar2026: Math.round(base * forcedFactors[2]),
      apr2026: Math.round(base * forcedFactors[3]),
      may2026: Math.round(base * forcedFactors[4]),
      jun2026: Math.round(base * forcedFactors[5]),
      jul2026: Math.round(base * forcedFactors[6]),
      aug2026: Math.round(base * forcedFactors[7]),
      sep2026: Math.round(base * forcedFactors[8]),
      oct2026: Math.round(base * forcedFactors[9]),
      nov2026: Math.round(base * forcedFactors[10]),
      dec2026: Math.round(base * forcedFactors[11]),
    };
    const q1 = forcedMonths.jan2026 + forcedMonths.feb2026 + forcedMonths.mar2026;
    const q2 = forcedMonths.apr2026 + forcedMonths.may2026 + forcedMonths.jun2026;
    const q3 = forcedMonths.jul2026 + forcedMonths.aug2026 + forcedMonths.sep2026;
    const q4 = forcedMonths.oct2026 + forcedMonths.nov2026 + forcedMonths.dec2026;
    const year = q1 + q2 + q3 + q4;
    return { year, h1: q1 + q2, h2: q3 + q4, q1, q2, q3, q4, ...forcedMonths };
  }

  // Keep other Sales Agreement Quantity accounts comparatively flatter so
  // Michigan visibly stands out with more "Critical" heat-map cells.
  if (seed.includes('measure-sa-qty-')) {
    const mildFactors = [0.90, 0.95, 1.00, 1.03, 1.06, 1.10, 0.98, 1.12, 0.93, 1.07, 0.96, 1.02];
    const monthKeys = [
      'jan2026', 'feb2026', 'mar2026', 'apr2026', 'may2026', 'jun2026',
      'jul2026', 'aug2026', 'sep2026', 'oct2026', 'nov2026', 'dec2026',
    ] as const;
    const months = monthKeys.reduce((acc, monthKey, idx) => {
      const jitter = (seededRandom(`${seed}-${monthKey}`) - 0.5) * 0.08; // +/- 4%
      const factor = Math.max(0.82, Math.min(1.20, mildFactors[idx] + jitter));
      acc[monthKey] = Math.round(base * factor);
      return acc;
    }, {} as Record<typeof monthKeys[number], number>);
    const q1 = months.jan2026 + months.feb2026 + months.mar2026;
    const q2 = months.apr2026 + months.may2026 + months.jun2026;
    const q3 = months.jul2026 + months.aug2026 + months.sep2026;
    const q4 = months.oct2026 + months.nov2026 + months.dec2026;
    const year = q1 + q2 + q3 + q4;
    return { year, h1: q1 + q2, h2: q3 + q4, q1, q2, q3, q4, ...months };
  }

  const baseFactors = [0.60, 0.78, 0.98, 1.18, 1.32, 1.55, 1.08, 1.68, 0.72, 1.42, 0.76, 1.24];
  const monthKeys = [
    'jan2026', 'feb2026', 'mar2026', 'apr2026', 'may2026', 'jun2026',
    'jul2026', 'aug2026', 'sep2026', 'oct2026', 'nov2026', 'dec2026',
  ] as const;

  const months = monthKeys.reduce((acc, monthKey, idx) => {
    // Deterministic jitter per account/measure/month to avoid uniform shapes.
    const jitter = (seededRandom(`${seed}-${monthKey}`) - 0.5) * 0.34; // +/- 17%
    const factor = Math.max(0.42, Math.min(1.92, baseFactors[idx] + jitter));
    acc[monthKey] = Math.round(base * factor);
    return acc;
  }, {} as Record<typeof monthKeys[number], number>);

  const q1 = months.jan2026 + months.feb2026 + months.mar2026;
  const q2 = months.apr2026 + months.may2026 + months.jun2026;
  const q3 = months.jul2026 + months.aug2026 + months.sep2026;
  const q4 = months.oct2026 + months.nov2026 + months.dec2026;
  const year = q1 + q2 + q3 + q4;
  return { year, h1: q1 + q2, h2: q3 + q4, q1, q2, q3, q4, ...months };
};

// Helper: round to nearest integer for cleaner display
const r = (n: number) => Math.round(n);

// Helper: build a monthly + quarterly values object from a month→value map
const buildValues = (months: Record<string, number>) => {
  const q1 = months.jan2026 + months.feb2026 + months.mar2026;
  const q2 = months.apr2026 + months.may2026 + months.jun2026;
  const q3 = months.jul2026 + months.aug2026 + months.sep2026;
  const q4 = months.oct2026 + months.nov2026 + months.dec2026;
  return { year: q1+q2+q3+q4, h1: q1 + q2, h2: q3 + q4, q1, q2, q3, q4, ...months } as GridRow['values'];
};

const MONTH_KEYS = [
  'jan2026','feb2026','mar2026','apr2026','may2026','jun2026',
  'jul2026','aug2026','sep2026','oct2026','nov2026','dec2026',
] as const;

// Category seasonal profiles for SA Revenue — rotate which category leads each quarter.
// Values > 1 = above-average month; designed so rank ORDER changes across months.
// trn (Transmission Assembly): Q1 + Q4 peak (year-end production ramp)
// chx (Chassis Components):    Q2 + Q3 peak (mid-year platform builds)
// eng (Engine Components):     Q2 peak (spring maintenance season)
// elc (Electrical Systems):    Q3 + Q4 peak (tech content year-end)
const CAT_SEASON: Record<string, number[]> = {
  trn: [1.45, 1.38, 1.20, 0.88, 0.80, 0.75, 0.78, 0.84, 0.92, 1.05, 1.28, 1.47],
  chx: [0.78, 0.82, 0.92, 1.18, 1.38, 1.45, 1.42, 1.35, 1.22, 1.05, 0.88, 0.75],
  eng: [0.85, 0.90, 1.08, 1.38, 1.45, 1.35, 1.05, 0.92, 0.82, 0.88, 0.95, 0.97],
  elc: [0.90, 0.88, 0.85, 0.92, 0.95, 1.00, 1.18, 1.32, 1.42, 1.45, 1.38, 1.35],
};

// Per-account (plant) seasonal profiles — each peaks in a different part of the year so the
// leading plant *rotates* month to month. Applied to every measure's leaf values (which roll
// up into the account totals), so the measure's "share of children" pie shows a clear,
// readable seasonal pattern instead of near-constant slices.
// mich: winter peak · ohio: late-spring · texas: summer · cal: autumn · geo: spring · ill: bimodal
const ACCOUNT_SEASON: Record<string, number[]> = {
  mich:  [1.55, 1.46, 1.26, 1.00, 0.82, 0.70, 0.66, 0.74, 0.90, 1.12, 1.36, 1.52],
  ohio:  [0.78, 0.88, 1.04, 1.26, 1.44, 1.50, 1.40, 1.24, 1.06, 0.90, 0.80, 0.74],
  texas: [0.70, 0.76, 0.88, 1.02, 1.22, 1.42, 1.52, 1.48, 1.30, 1.08, 0.86, 0.72],
  cal:   [1.12, 1.00, 0.88, 0.80, 0.78, 0.86, 0.98, 1.14, 1.32, 1.46, 1.44, 1.28],
  geo:   [0.82, 0.96, 1.16, 1.38, 1.48, 1.34, 1.12, 0.96, 0.84, 0.80, 0.90, 1.08],
  ill:   [1.34, 1.30, 1.10, 0.90, 0.80, 0.82, 0.96, 1.16, 1.34, 1.18, 0.92, 0.98],
};
const FLAT_SEASON = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];

// Per-product monthly boost seeds: each product gets a phase-shifted sine-like pattern
// so within a category, the "top product" rotates month-by-month.
// Values are multiplied with the base product fraction.
const prodMonthFactor = (prodSeed: string, monthIdx: number): number => {
  // Two independent sinusoidal components with different periods and phases, seeded per product.
  const phase1 = seededRandom(`${prodSeed}-phase1`) * Math.PI * 2;
  const phase2 = seededRandom(`${prodSeed}-phase2`) * Math.PI * 2;
  const amp1   = 0.30 + seededRandom(`${prodSeed}-amp1`)  * 0.20; // 0.30–0.50
  const amp2   = 0.15 + seededRandom(`${prodSeed}-amp2`)  * 0.15; // 0.15–0.30
  const t = (monthIdx / 12) * Math.PI * 2;
  return 1.0 + amp1 * Math.sin(t + phase1) + amp2 * Math.sin(t * 2 + phase2);
};

// Helper function to create the standard Manufacturing hierarchy structure for a measure.
// SA Revenue: categories have distinct seasonal profiles; products have unique monthly rhythms
// so that the concentration heat-map shows different leaders each month.
const createManufacturingHierarchy = (
  measureId: string,
  accountBase: number,
  _categoryBase: number,
  _productBase: number
): GridRow[] => {
  const b = accountBase;
  const isSaRev = measureId === 'measure-sa-rev';

  const ACCOUNTS: [string, string, number][] = [
    ['mich',  'MagnaDrive - Michigan Plant',    1.40],
    ['ohio',  'MagnaDrive - Ohio Plant',        1.10],
    ['texas', 'MagnaDrive - Texas Plant',       1.25],
    ['cal',   'MagnaDrive - California Plant',  0.90],
    ['geo',   'MagnaDrive - Georgia Plant',     0.75],
    ['ill',   'MagnaDrive - Illinois Plant',    0.85],
  ];

  type ProductDef = [string, string, number];
  type CategoryDef = [string, string, number, ProductDef[]];

  const CATEGORIES: CategoryDef[] = [
    [
      'trn', 'Transmission Assembly', 0.30,
      [
        ['trn-750a',  'TRN 750 - A',         0.14],
        ['trn-750b',  'TRN 750 - B',         0.13],
        ['trn-750c',  'TRN 750 - C',         0.12],
        ['trn-750d',  'TRN 750 - D',         0.11],
        ['trn-850a',  'TRN 850 - A',         0.14],
        ['trn-850b',  'TRN 850 - B',         0.13],
        ['trn-950s',  'TRN 950 - Standard',  0.12],
        ['trn-950x',  'TRN 950 - Xtreme',    0.11],
        ['trn-cvt',   'CVT Module - Gen3',   0.10],
      ],
    ],
    [
      'chx', 'Chassis Components', 0.25,
      [
        ['chx-fr1',  'Frame Rail - Type 1',       0.13],
        ['chx-fr2',  'Frame Rail - Type 2',       0.12],
        ['chx-cma',  'Cross Member - A',          0.11],
        ['chx-cmb',  'Cross Member - B',          0.10],
        ['chx-caf',  'Control Arm - Front Left',  0.12],
        ['chx-car',  'Control Arm - Front Right', 0.12],
        ['chx-sfr',  'Sub Frame - Standard',      0.11],
        ['chx-mbh',  'Mounting Bracket - Heavy',  0.10],
        ['chx-sway', 'Sway Bar - 28mm',           0.09],
      ],
    ],
    [
      'eng', 'Engine Components', 0.28,
      [
        ['eng-blkv6', 'Cylinder Block - V6',      0.13],
        ['eng-blkv8', 'Cylinder Block - V8',      0.12],
        ['eng-crka',  'Crankshaft - Type A',      0.11],
        ['eng-crkb',  'Crankshaft - Type B',      0.10],
        ['eng-cam',   'Camshaft - Standard',      0.11],
        ['eng-rod',   'Connecting Rod Set',       0.10],
        ['eng-pump',  'Oil Pump - High Flow',     0.09],
        ['eng-tck',   'Timing Chain Kit',         0.09],
        ['eng-vc',    'Valve Cover - Aluminium',  0.08],
        ['eng-hgk',   'Head Gasket Kit',          0.07],
      ],
    ],
    [
      'elc', 'Electrical Systems', 0.17,
      [
        ['elc-alt120', 'Alternator - 120A',           0.14],
        ['elc-alt150', 'Alternator - 150A',           0.13],
        ['elc-str20',  'Starter Motor - 2.0 kW',     0.12],
        ['elc-str35',  'Starter Motor - 3.5 kW',     0.11],
        ['elc-wmain',  'Wiring Harness - Main',      0.12],
        ['elc-waux',   'Wiring Harness - Auxiliary', 0.10],
        ['elc-ecu',    'Control Module - ECU',       0.11],
        ['elc-o2up',   'O2 Sensor - Upstream',       0.09],
        ['elc-o2dn',   'O2 Sensor - Downstream',     0.08],
      ],
    ],
  ];

  // Cost multipliers per account — deliberately spread far apart so bar widths differ visibly.
  const ACC_COST: Record<string, number> = {
    mich: 1.65, texas: 1.20, ohio: 0.40, cal: 0.70, geo: 1.45, ill: 0.85,
  };
  // Cost multipliers per category slug — Transmission is most expensive, Chassis cheapest.
  const CAT_COST: Record<string, number> = {
    trn: 1.40, eng: 1.20, elc: 0.80, chx: 0.60,
  };

  return ACCOUNTS.map(([accSlug, accName, accScale]) => {
    const accId  = `account-${accSlug}-${measureId}`;
    const accVal = r(b * accScale);
    const accCost = r(b * (ACC_COST[accSlug] ?? 1.0));
    // Seasonal rhythm for this plant — rotates which plant leads the "share of children" pie.
    const accSeason = ACCOUNT_SEASON[accSlug] ?? FLAT_SEASON;

    const categoryRows: GridRow[] = CATEGORIES.map(([catSlug, catName, catFrac, products]) => {
      const catId      = `category-${accSlug}-${catSlug}-${measureId}`;
      const catBaseVal = r(accVal * catFrac);
      // Category cost: base fraction × category cost multiplier × small seeded jitter
      const catCostJitter = 0.75 + seededRandom(`${catId}-cost-j`) * 0.50; // 0.75–1.25
      const catCost = r(accCost * catFrac * (CAT_COST[catSlug] ?? 1.0) * catCostJitter);

      // Build per-month category values: SA Revenue gets seasonal profile, others flat
      const catMonths: Record<string, number> = {};
      MONTH_KEYS.forEach((mk, idx) => {
        const season = isSaRev ? (CAT_SEASON[catSlug]?.[idx] ?? 1.0) : 1.0;
        // Small per-account jitter so categories of different accounts aren't identical
        const jitter = 1 + (seededRandom(`${catId}-${mk}-j`) - 0.5) * 0.10;
        catMonths[mk] = r(catBaseVal * season * accSeason[idx] * jitter);
      });

      // Build per-month product values: each product has its own seasonal rhythm
      const productRows: GridRow[] = products.map(([prodSlug, prodName, prodFrac]) => {
        const prodId      = `product-${accSlug}-${catSlug}-${prodSlug}-${measureId}`;
        const prodBaseVal = r(catBaseVal * prodFrac);
        // Product cost: seeded variation so siblings differ clearly (0.4–1.6× fraction)
        const prodCostMult = 0.40 + seededRandom(`${prodId}-cost`) * 1.20;
        const prodCost = r(catCost * prodFrac * prodCostMult * 6); // ×6 to match scale
        const prodMonths: Record<string, number> = {};
        MONTH_KEYS.forEach((mk, idx) => {
          const season  = isSaRev ? (CAT_SEASON[catSlug]?.[idx] ?? 1.0) : 1.0;
          // Per-product sinusoidal rhythm causes rank rotation within the category
          const pFactor = isSaRev ? prodMonthFactor(`${prodId}`, idx) : 1.0;
          const jitter  = 1 + (seededRandom(`${prodId}-${mk}-j`) - 0.5) * 0.08;
          // Account seasonal rhythm rolls up into the plant total, so the plant shares in
          // the measure-level pie rotate through the year.
          prodMonths[mk] = r(prodBaseVal * season * pFactor * accSeason[idx] * jitter);
        });
        return {
          id: prodId, name: prodName, parentId: catId,
          level: 3, type: 'product' as const,
          values: { ...buildValues(prodMonths), _cost: prodCost },
        };
      });

      return {
        id: catId, name: catName, parentId: accId,
        level: 2, type: 'category' as const,
        values: { ...buildValues(catMonths), _cost: catCost },
        children: productRows,
      };
    });

    return {
      id: accId, name: accName, parentId: measureId,
      level: 1, type: 'account' as const,
      values: { ...accountMonthlyValue(accVal, `${measureId}-${accSlug}`), _cost: accCost },
      children: categoryRows,
    };
  });
};

/** Re-key every id in a row subtree with a unique prefix (and fix parentId links)
 *  so cloned top-level rows never collide on grid row keys. */
function reIdRow(row: GridRow, prefix: string, parentId: string): GridRow {
  const newId = `${prefix}-${row.id}`;
  const cloned: GridRow = { ...row, id: newId, parentId };
  if (row.children) cloned.children = row.children.map((c) => reIdRow(c, prefix, newId));
  return cloned;
}

/**
 * Relabel a dataset's top-level rows to the account groups the user picked in the
 * Create Plan modal, keeping the realistic underlying data. The i-th selected
 * value reuses the i-th template row (cycling if more are selected than exist),
 * so the grid shows exactly the accounts the user chose instead of the dataset's
 * built-in names. Measure totals are recomputed from the resulting rows.
 */
function applyTopLevelSelection(data: MeasureData[], values: string[]): MeasureData[] {
  if (!values.length) return data;
  return data.map((measure) => {
    const templates = measure.children ?? [];
    if (templates.length === 0) return measure;
    const children = values.map((val, i) => {
      const clone = reIdRow(templates[i % templates.length], `sel${i}`, measure.id);
      clone.name = val;
      return clone;
    });
    const summed = sumValues(children.map((c) => c.values), 0, measure.id);
    return { ...measure, children, values: summed };
  });
}

export const getMockData = (industry: IndustryType | null): MeasureData[] => {
  if (isConfigIndustry(industry)) {
    // Untouched OOTB Account Planning → serve the ready-made deep dataset (realistic
    // numbers). Any hierarchy/measure customization drops through to the generated grid.
    if (isPristineOotbAccountPlanning(industry)) {
      // Honor the account groups picked in Create Plan by relabeling the top-level
      // rows; fall back to the dataset's built-in accounts when none were chosen.
      const selected = getConfigTopLevelValues(industry);
      if (selected) {
        const relabeled = applyTopLevelSelection(deepHierarchyData, selected);
        ensureWeekValues(relabeled);
        return relabeled;
      }
      ensureWeekValues(deepHierarchyData);
      return deepHierarchyData;
    }
    const configData = getConfigMockData(industry as string);
    ensureWeekValues(configData);
    return configData;
  }
  if (industry === 'consumer-goods') {
    ensureWeekValues(consumerGoodsData);
    return consumerGoodsData;
  }
  if (industry === 'manufacturing-deep') {
    ensureWeekValues(deepHierarchyData);
    return deepHierarchyData;
  }
  if (industry === 'manufacturing-acme') {
    ensureWeekValues(acmeHierarchyData);
    return acmeHierarchyData;
  }
  if (industry === 'df-demo') {
    // Project-local demo dataset — isolated clone of the manufacturing tree. The agreement-gap
    // deviation is authored on October then swapped into March (step 6 in dfDemoData below), so
    // the shortfall lands in March.
    ensureWeekValues(dfDemoData);
    return dfDemoData;
  }
  // manufacturing, grid-264 ("264 Updated Grid"), and null → main project manufacturing tree
  ensureWeekValues(manufacturingData);
  return manufacturingData;
};

const manufacturingData: MeasureData[] = withForecastAsSum([
  // Sales Agreement Quantity
  {
    id: 'measure-sa-qty',
    name: 'Sales Agreement Quantity (No.s)',
    values: monthlyValue(800),
    children: createManufacturingHierarchy('measure-sa-qty', 800, 400, 80),
  },
  // Sales Agreement Revenue
  {
    id: 'measure-sa-rev',
    name: 'Sales Agreement Revenue',
    values: monthlyValue(80000),
    children: createManufacturingHierarchy('measure-sa-rev', 80000, 40000, 8000),
  },
  // Opportunity Quantity
  {
    id: 'measure-opp-qty',
    name: 'Opportunity Quantity (No.s)',
    values: monthlyValue(1200),
    children: createManufacturingHierarchy('measure-opp-qty', 1200, 600, 120),
  },
  // Opportunity Revenue
  {
    id: 'measure-opp-rev',
    name: 'Opportunity Revenue',
    values: monthlyValue(120000),
    children: createManufacturingHierarchy('measure-opp-rev', 120000, 60000, 12000),
  },
  // Order Quantity
  {
    id: 'measure-order-qty',
    name: 'Order Quantity (No.s)',
    values: monthlyValue(950),
    children: createManufacturingHierarchy('measure-order-qty', 950, 475, 95),
  },
  // Order Revenue
  {
    id: 'measure-order-rev',
    name: 'Order Revenue',
    values: monthlyValue(95000),
    children: createManufacturingHierarchy('measure-order-rev', 95000, 47500, 9500),
  },
  // Last Year Order Quantity
  {
    id: 'measure-ly-order-qty',
    name: 'Last Year Order Quantity (No.s)',
    values: monthlyValue(750),
    children: createManufacturingHierarchy('measure-ly-order-qty', 750, 375, 75),
  },
  // Last Years Order Revenue
  {
    id: 'measure-ly-order-rev',
    name: 'Last Years Order Revenue',
    values: monthlyValue(75000),
    children: createManufacturingHierarchy('measure-ly-order-rev', 75000, 37500, 7500),
  },
  // Forecasted Quantity
  {
    id: 'measure-forecast-qty',
    name: 'Forecasted Quantity (No.s)',
    values: monthlyValue(1000),
    children: createManufacturingHierarchy('measure-forecast-qty', 1000, 500, 100),
  },
  // Forecasted Revenue
  {
    id: 'measure-forecast-rev',
    name: 'Forecasted Revenue',
    values: monthlyValue(100000),
    children: createManufacturingHierarchy('measure-forecast-rev', 100000, 50000, 10000),
  },
]);

// ─────────────────────────────────────────────────────────────────────────────
// DF demo (project-local): isolated clone of the manufacturing dataset.
// Two Georgia Plant tweaks, both scoped to this dataset only (the shared
// manufacturing grid is completely untouched):
//   1. Sales Agreement Quantity — Sep/Oct boosted well above Order Quantity so the
//      Charts "Variance" tab shows the agreement line pulling away above actual in
//      those two months while the rest of the year stays in line.
//   2. Order Quantity — the Sep→Oct change is reshaped so Electrical Systems is the
//      clear key driver (most negative) in the waterfall's "What drove Oct" panel,
//      with the other categories flat-to-slightly-positive. Oct total stays 588.
// ─────────────────────────────────────────────────────────────────────────────
const DF_MONTH_KEYS = [
  'jan2026', 'feb2026', 'mar2026', 'apr2026', 'may2026', 'jun2026',
  'jul2026', 'aug2026', 'sep2026', 'oct2026', 'nov2026', 'dec2026',
];

// Recompute quarter/half/year aggregates on a values bag from its 12 months.
const dfRederiveAggregates = (v: Record<string, number>): void => {
  const m = (k: string) => Number(v[k] ?? 0);
  const q1 = m('jan2026') + m('feb2026') + m('mar2026');
  const q2 = m('apr2026') + m('may2026') + m('jun2026');
  const q3 = m('jul2026') + m('aug2026') + m('sep2026');
  const q4 = m('oct2026') + m('nov2026') + m('dec2026');
  v.q1 = q1; v.q2 = q2; v.q3 = q3; v.q4 = q4;
  v.h1 = q1 + q2; v.h2 = q3 + q4; v.year = q1 + q2 + q3 + q4;
};

// Bottom-up recompute: leaves keep their (boosted) months; every parent's months
// become the sum of its children, then aggregates are rederived from those months.
const dfRecomputeSubtree = (row: GridRow): void => {
  if (row.children && row.children.length) {
    row.children.forEach(dfRecomputeSubtree);
    DF_MONTH_KEYS.forEach((mk) => {
      (row.values as Record<string, number>)[mk] =
        row.children!.reduce((s, c) => s + Number((c.values as Record<string, number>)[mk] ?? 0), 0);
    });
  }
  dfRederiveAggregates(row.values as Record<string, number>);
};

// Sum a month value across a row's leaf descendants (mirrors the chart's rollup).
const dfLeafSum = (row: GridRow, mk: string): number => {
  if (row.children && row.children.length) {
    return row.children.reduce((s, c) => s + dfLeafSum(c, mk), 0);
  }
  return Number((row.values as Record<string, number>)[mk] ?? 0);
};

// Scale a single month across every leaf under `row` by `factor`.
const dfScaleLeafMonth = (row: GridRow, mk: string, factor: number): void => {
  if (row.children && row.children.length) {
    row.children.forEach((c) => dfScaleLeafMonth(c, mk, factor));
  } else {
    const v = row.values as Record<string, number>;
    v[mk] = r(Number(v[mk] ?? 0) * factor);
  }
};

// Recompute a measure's total row (months + aggregates) from its account children.
const dfRollupMeasureTotal = (measure: MeasureData): void => {
  DF_MONTH_KEYS.forEach((mk) => {
    (measure.values as Record<string, number>)[mk] =
      (measure.children ?? []).reduce(
        (s, a) => s + Number((a.values as Record<string, number>)[mk] ?? 0), 0);
  });
  dfRederiveAggregates(measure.values as Record<string, number>);
};

const dfDemoData: MeasureData[] = (() => {
  const clone: MeasureData[] = JSON.parse(JSON.stringify(manufacturingData));

  // ── 1. Sales Agreement Quantity: boost Georgia Sep/Oct above Order Quantity. ──
  const saMeasure = clone.find((mm) => mm.id === 'measure-sa-qty');
  const saGeorgia = saMeasure?.children?.find((a) => a.id === 'account-geo-measure-sa-qty');
  if (saMeasure && saGeorgia) {
    const boostLeaves = (row: GridRow): void => {
      if (row.children && row.children.length) {
        row.children.forEach(boostLeaves);
      } else {
        const v = row.values as Record<string, number>;
        v.sep2026 = r(Number(v.sep2026 ?? 0) * 1.6);
        v.oct2026 = r(Number(v.oct2026 ?? 0) * 2.15);
      }
    };
    boostLeaves(saGeorgia);
    dfRecomputeSubtree(saGeorgia);
    dfRollupMeasureTotal(saMeasure);
  }

  // ── 1b. Electrical Systems / Georgia — reshape Sales Agreement Quantity so the ──
  // category's Charts "Variance" tab (Actual = Order Quantity vs reference = Sales
  // Agreement Quantity) tells one clean story: the agreement tracks just above order
  // Jan→May (both inside the ±5% band, order a little less), then flattens/plateaus at
  // ~186–188 while Order Quantity keeps sliding — so the two lines pull apart after May
  // and the gap is widest in October (agreement ~188 vs order 77). Overrides step-1's
  // Sep/Oct boost for the Electrical Systems leaves only; other categories untouched.
  // Electrical Systems carries the whole Georgia agreement-vs-order story: SA tracks just above
  // order early (Jan→May, both inside the ±5% band) then holds a flat plateau (~190) while Order
  // Quantity slides. The gap therefore widens because *order falls*, not because agreement spikes
  // — so the Sales Agreement line has NO October peak, it just stays elevated while actual drops.
  // The gap grows steadily Aug→Sep→Oct (largest in Oct: SA 191 vs Order 77), making Electrical
  // Systems by far the biggest negative in the "Children variance" breakdown for those months.
  const SA_ELC_GEO_TARGETS: Record<string, number> = {
    jan2026: 103, feb2026: 122, mar2026: 148, apr2026: 175, may2026: 188, jun2026: 190,
    jul2026: 191, aug2026: 191, sep2026: 190, oct2026: 191, nov2026: 191, dec2026: 192,
  };
  // Per-product SA share (elc product order in CATEGORIES). Skewed on purpose: the
  // sensors, control module, auxiliary harness and the small 2.0 kW starter carry the
  // larger *agreement*, so when their orders fall short they read as the biggest
  // negatives in the "Children variance" breakdown (paired with the Order Quantity
  // split in step 3). Order:
  //   alt120 alt150 str20 str35 wmain waux ecu  o2up o2dn
  const SA_ELC_GEO_PRODUCT_FRACS = [0.09, 0.09, 0.11, 0.09, 0.10, 0.11, 0.12, 0.14, 0.15];
  const saElcGeo = saGeorgia?.children?.find(
    (c) => c.id === 'category-geo-elc-measure-sa-qty');
  if (saMeasure && saGeorgia && saElcGeo?.children) {
    const saKids = saElcGeo.children;
    DF_MONTH_KEYS.forEach((mk) => {
      const target = SA_ELC_GEO_TARGETS[mk] ?? 0;
      let assigned = 0;
      saKids.forEach((prod, i) => {
        const frac = SA_ELC_GEO_PRODUCT_FRACS[i] ?? 1 / saKids.length;
        const v = r(target * frac);
        (prod.values as Record<string, number>)[mk] = v;
        assigned += v;
      });
      // Absorb the rounding residual into the first product so the category total is exact.
      (saKids[0].values as Record<string, number>)[mk] += target - assigned;
    });
    saKids.forEach((p) => dfRederiveAggregates(p.values as Record<string, number>));
    dfRecomputeSubtree(saGeorgia);
    dfRollupMeasureTotal(saMeasure);
  }

  // ── 2. Order Quantity: reshape Georgia's Sep→Oct so Electrical Systems is the ──
  // clear key driver (largest drop) in the "What drove Oct" breakdown, keeping the
  // other categories flat-to-slightly-positive. Sep is left as-is; Oct is scaled per
  // category to hit these targets (Oct total stays ~588 to preserve the share pie).
  const ORDER_OCT_TARGETS: Record<string, number> = {
    trn: 198, // Transmission Assembly  (Sep 196 → +2, slightly up)
    chx: 151, // Chassis Components     (Sep 150 → +1, flat/slightly up)
    eng: 162, // Engine Components      (Sep 168 → -6, mildly down)
    elc: 77,  // Electrical Systems     (Sep 103 → -26, the key negative driver)
  };
  const orderMeasure = clone.find((mm) => mm.id === 'measure-order-qty');
  const orderGeorgia = orderMeasure?.children?.find((a) => a.id === 'account-geo-measure-order-qty');
  if (orderMeasure && orderGeorgia) {
    (orderGeorgia.children ?? []).forEach((cat) => {
      const slug = Object.keys(ORDER_OCT_TARGETS).find((s) =>
        cat.id === `category-geo-${s}-measure-order-qty`);
      if (!slug) return;
      const currentOct = dfLeafSum(cat, 'oct2026');
      if (currentOct > 0) {
        dfScaleLeafMonth(cat, 'oct2026', ORDER_OCT_TARGETS[slug] / currentOct);
      }
    });
    dfRecomputeSubtree(orderGeorgia);
    dfRollupMeasureTotal(orderMeasure);
  }

  // ── 3. Electrical Systems / Georgia — redistribute Order Quantity across products ──
  // so the Charts "Children variance" breakdown ranks the sensors, control module,
  // the auxiliary harness and the small 2.0 kW starter as the biggest shortfalls vs
  // agreement, while the alternators / 3.5 kW starter / main harness hold up (some
  // even land above reference). Each month's category total is preserved (the parent
  // Actual line is untouched) — only the product split moves. Product order:
  //   alt120 alt150 str20 str35 wmain waux ecu  o2up o2dn
  const ORDER_ELC_GEO_PRODUCT_FRACS = [0.16, 0.15, 0.08, 0.14, 0.14, 0.08, 0.08, 0.09, 0.08];
  const orderElcGeo = orderGeorgia?.children?.find(
    (c) => c.id === 'category-geo-elc-measure-order-qty');
  if (orderMeasure && orderGeorgia && orderElcGeo?.children) {
    const orderKids = orderElcGeo.children;
    DF_MONTH_KEYS.forEach((mk) => {
      const total = orderKids.reduce(
        (s, p) => s + Number((p.values as Record<string, number>)[mk] ?? 0), 0);
      let assigned = 0;
      orderKids.forEach((prod, i) => {
        const frac = ORDER_ELC_GEO_PRODUCT_FRACS[i] ?? 1 / orderKids.length;
        const v = r(total * frac);
        (prod.values as Record<string, number>)[mk] = v;
        assigned += v;
      });
      // Absorb the rounding residual into the first product so the category total is exact.
      (orderKids[0].values as Record<string, number>)[mk] += total - assigned;
    });
    // Override Sep + Oct with explicit product splits so the Charts waterfall
    // "What drove Oct (vs Sep)" ranks the sensors / ECU / auxiliary harness / 2.0 kW
    // starter as the biggest month-over-month declines (these are also the < 9 red
    // cells in Oct), while the two alternators actually GROW Sep→Oct (+2 / +1) — a
    // couple of green movers against the decline — and the 3.5 kW starter / main
    // harness barely move. Category totals stay exactly 103 (Sep) and 77 (Oct), so the
    // parent line and the < 9 red-cell set are both untouched.
    //                          alt120 alt150 str20 str35 wmain waux ecu o2up o2dn
    const ORDER_ELC_GEO_SEP = [   12,    12,   10,   11,   11,  10,  12,  12,  13]; // = 103
    const ORDER_ELC_GEO_OCT = [   14,    13,    6,   10,   10,   6,   6,   6,   6]; // =  77
    orderKids.forEach((prod, i) => {
      (prod.values as Record<string, number>).sep2026 = ORDER_ELC_GEO_SEP[i] ?? 0;
      (prod.values as Record<string, number>).oct2026 = ORDER_ELC_GEO_OCT[i] ?? 0;
    });
    orderKids.forEach((p) => dfRederiveAggregates(p.values as Record<string, number>));
    dfRecomputeSubtree(orderGeorgia);
    dfRollupMeasureTotal(orderMeasure);
  }

  // ── 4. Transmission / Engine / Chassis (Georgia) — set Sales Agreement Quantity to sit ──
  // just above Order Quantity every month (a small, constant ~3% gap, same shape as order).
  // This lifts the account-level agreement line consistently above the order line all year
  // (in-band Jan→Jun, order slipping below the band later) while keeping these three
  // categories' own variance tiny — so Electrical Systems (step 1b) remains the clear, single
  // driver of the widening gap in the Charts "Variance" child breakdown. Runs after steps 2–3
  // so it reads the *final* order values. Uses each category's existing product split (scaled).
  const BIG3_SA_FACTOR = 1.03;
  const BIG3_SLUGS = ['trn', 'eng', 'chx'];
  if (orderMeasure && saMeasure && orderGeorgia && saGeorgia) {
    BIG3_SLUGS.forEach((slug) => {
      const oc = orderGeorgia.children?.find(
        (c) => c.id === `category-geo-${slug}-measure-order-qty`);
      const sc = saGeorgia.children?.find(
        (c) => c.id === `category-geo-${slug}-measure-sa-qty`);
      if (!oc || !sc) return;
      DF_MONTH_KEYS.forEach((mk) => {
        const target = r(dfLeafSum(oc, mk) * BIG3_SA_FACTOR);
        const current = dfLeafSum(sc, mk);
        dfScaleLeafMonth(sc, mk, current > 0 ? target / current : 0);
      });
    });
    dfRecomputeSubtree(saGeorgia);
    dfRollupMeasureTotal(saMeasure);
  }

  // ── 4b. Electrical Systems / Georgia — retune Sales Agreement so the Charts ──
  // "Variance" tab (Actual = Order Quantity vs reference = Sales Agreement Quantity)
  // shows the agreement hugging actual all year (a small ~3% in-band gap) EXCEPT one
  // single month where order falls well short of the agreement. This replaces the old
  // step-1b plateau (which made the gap widen across May→Oct) so the deviation is a
  // clean single-month spike instead. Authored on OCTOBER — step 6 later swaps Mar↔Oct
  // across every row, so the big gap ends up on MARCH (matching the red "below committed
  // agreement" cells, which are keyed to March). Runs after steps 2–4 so it reads the
  // FINAL order totals; SA is set per product so it hugs order (×1.03) every month, except
  // the deviation month where the category agreement total is pinned to a fixed 191 — so with
  // order at ~77 the March gap reads ~60% below agreement, prominent for the demo.
  const SA_ELC_GAP_FACTOR = 1.03;        // agreement sits ~3% above order → inside the ±5% band
  const SA_ELC_DEVIATION_TARGET = 191;   // deviation month: fixed agreement total (order ~77 → ~60% gap)
  const SA_ELC_DEVIATION_MONTH = 'oct2026'; // swapped into March by step 6
  {
    const orderElcGeoFinal = orderGeorgia?.children?.find(
      (c) => c.id === 'category-geo-elc-measure-order-qty');
    const saElcGeoFinal = saGeorgia?.children?.find(
      (c) => c.id === 'category-geo-elc-measure-sa-qty');
    if (saMeasure && saGeorgia && orderElcGeoFinal && saElcGeoFinal?.children) {
      const saKids = saElcGeoFinal.children;
      DF_MONTH_KEYS.forEach((mk) => {
        const orderTotal = dfLeafSum(orderElcGeoFinal, mk);
        const target = mk === SA_ELC_DEVIATION_MONTH
          ? SA_ELC_DEVIATION_TARGET
          : r(orderTotal * SA_ELC_GAP_FACTOR);
        let assigned = 0;
        saKids.forEach((prod, i) => {
          const frac = SA_ELC_GEO_PRODUCT_FRACS[i] ?? 1 / saKids.length;
          const v = r(target * frac);
          (prod.values as Record<string, number>)[mk] = v;
          assigned += v;
        });
        // Absorb the rounding residual into the first product so the category total is exact.
        (saKids[0].values as Record<string, number>)[mk] += target - assigned;
      });
      saKids.forEach((p) => dfRederiveAggregates(p.values as Record<string, number>));
      dfRecomputeSubtree(saGeorgia);
      dfRollupMeasureTotal(saMeasure);
    }
  }

  // ── 5. ✦ Predictive Forecasted Quantity — a model row shown just above Order ──
  // Quantity on default load. Every cell sits within ±5% of the matching Last Year
  // Order Quantity value (deterministic per-leaf jitter, so numbers are stable across
  // reloads), then rolled up bottom-up so parents stay consistent with their leaves.
  const lyOrderMeasure = clone.find((mm) => mm.id === 'measure-ly-order-qty');
  if (lyOrderMeasure) {
    const OLD_ID = 'measure-ly-order-qty';
    const NEW_ID = 'measure-pred-forecast-qty';
    // Deterministic factor in [0.95, 1.05] from a string seed (FNV-1a hash).
    const dfBandFactor = (seed: string): number => {
      let h = 2166136261;
      for (let i = 0; i < seed.length; i += 1) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return 0.95 + (((h >>> 0) % 1001) / 1000) * 0.1; // 0.95 … 1.05
    };
    const predMeasure: MeasureData = JSON.parse(JSON.stringify(lyOrderMeasure));
    // Re-id every row (so the new measure's cells are unique) and jitter each row's
    // months by ±5% against its Last-Year counterpart. The base hierarchy stores
    // authored totals per level (parents are NOT strict leaf rollups), so we jitter
    // each level in place — keeping every displayed row within ±5% of Last Year —
    // and rederive that row's quarter/half/year aggregates from its own months.
    const rebuild = (row: GridRow): void => {
      if (typeof row.id === 'string') row.id = row.id.split(OLD_ID).join(NEW_ID);
      const v = row.values as Record<string, number>;
      DF_MONTH_KEYS.forEach((mk) => {
        v[mk] = r(Number(v[mk] ?? 0) * dfBandFactor(`${row.id}|${mk}`));
      });
      dfRederiveAggregates(v);
      if (row.children && row.children.length) row.children.forEach(rebuild);
    };
    rebuild(predMeasure as unknown as GridRow);
    predMeasure.name = '✦ Predictive Forecasted Quantity';

    const orderIdx = clone.findIndex((mm) => mm.id === 'measure-order-qty');
    clone.splice(orderIdx >= 0 ? orderIdx : clone.length, 0, predMeasure);
  }

  // ── 6. Relocate the agreement-gap deviation from October to March ──
  // The whole story (order shortfall, elevated agreement line, predictive) was authored on
  // oct2026. Swap every row's March and October month values — across all measures and all
  // hierarchy levels — so the shortfall now lands in March and October reads as a normal month.
  // Quarter/half/year aggregates are rederived from the swapped months. All interactions,
  // thresholds and CTA behaviour stay identical; only the flagged month moves.
  const dfSwapMarOct = (row: GridRow): void => {
    const v = row.values as Record<string, number>;
    const tmp = v.mar2026;
    v.mar2026 = v.oct2026;
    v.oct2026 = tmp;
    dfRederiveAggregates(v);
    if (row.children && row.children.length) row.children.forEach(dfSwapMarOct);
  };
  clone.forEach((mm) => dfSwapMarOct(mm as unknown as GridRow));

  // ── 7. Uplift Sales Agreement Quantity + Predictive Forecasted Quantity ──────
  // Scale these two measures up uniformly (every row, every month) so the committed
  // agreement line and the model-forecast line sit ABOVE Order Quantity at the top
  // line — matching the charts and the "orders below committed agreement" story.
  // Order Quantity is untouched, and the red "below committed agreement" cells are
  // keyed off Order Quantity vs fixed thresholds (see computeAgreementRiskCellKeys),
  // so this uplift does not change which cells are flagged.
  //
  // REVERT: set both factors to 1 (or revert the commit that introduced this block)
  // to return to the pre-uplift numbers.
  const SA_QTY_UPLIFT = 1.3;   // Sales Agreement Quantity  (68,746 → ~89,370 FY26)
  const PRED_QTY_UPLIFT = 1.3; // Predictive Forecasted Qty (62,843 → ~81,700 FY26)
  const dfScaleRowTreeInPlace = (row: GridRow, factor: number): void => {
    const v = row.values as Record<string, number>;
    DF_MONTH_KEYS.forEach((mk) => { v[mk] = r(Number(v[mk] ?? 0) * factor); });
    dfRederiveAggregates(v);
    if (row.children && row.children.length) {
      row.children.forEach((c) => dfScaleRowTreeInPlace(c, factor));
    }
  };
  const saQtyMeasure = clone.find((mm) => mm.id === 'measure-sa-qty');
  if (saQtyMeasure && SA_QTY_UPLIFT !== 1) {
    dfScaleRowTreeInPlace(saQtyMeasure as unknown as GridRow, SA_QTY_UPLIFT);
  }
  const predQtyMeasure = clone.find((mm) => mm.id === 'measure-pred-forecast-qty');
  if (predQtyMeasure && PRED_QTY_UPLIFT !== 1) {
    dfScaleRowTreeInPlace(predQtyMeasure as unknown as GridRow, PRED_QTY_UPLIFT);
  }

  return clone;
})();

