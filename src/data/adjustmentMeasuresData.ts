import { MeasureData, GridRow } from '../types';

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
    q1,
    q2,
    q3,
    q4,
    ...months,
  };
};

// Extreme account-level seasonality for high-contrast heat-map demos.
const seededRandom = (seed: string): number => {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(33, h) ^ seed.charCodeAt(i)) >>> 0;
  }
  return h / 4294967296;
};

const accountMonthlyValue = (base: number, seed: string) => {
  const baseFactors = [0.60, 0.78, 0.98, 1.18, 1.32, 1.55, 1.08, 1.68, 0.72, 1.42, 0.76, 1.24];
  const monthKeys = [
    'jan2026', 'feb2026', 'mar2026', 'apr2026', 'may2026', 'jun2026',
    'jul2026', 'aug2026', 'sep2026', 'oct2026', 'nov2026', 'dec2026',
  ] as const;
  const months = monthKeys.reduce((acc, monthKey, idx) => {
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
  return { year, q1, q2, q3, q4, ...months };
};

// Helper function to create the standard hierarchy structure for a measure
const createHierarchy = (
  measureId: string,
  accountBase: number,
  categoryBase: number,
  productBase: number
): GridRow[] => {
  return [
    {
      id: `account-${measureId}`,
      name: 'MagnaDrive - Michigan Plant',
      parentId: measureId,
      level: 1,
      type: 'account',
      values: accountMonthlyValue(accountBase, measureId),
      children: [
        {
          id: `category-transmission-${measureId}`,
          name: 'Transmission Assembly',
          parentId: `account-${measureId}`,
          level: 2,
          type: 'category',
          values: monthlyValue(categoryBase),
          children: [
            {
              id: `product-trn-a-${measureId}`,
              name: 'TRN 750 - A',
              parentId: `category-transmission-${measureId}`,
              level: 3,
              type: 'product',
              values: monthlyValue(productBase),
            },
            {
              id: `product-trn-b-${measureId}`,
              name: 'TRN 750 - B',
              parentId: `category-transmission-${measureId}`,
              level: 3,
              type: 'product',
              values: monthlyValue(productBase),
            },
            {
              id: `product-trn-c-${measureId}`,
              name: 'TRN 750 - C',
              parentId: `category-transmission-${measureId}`,
              level: 3,
              type: 'product',
              values: monthlyValue(productBase),
            },
            {
              id: `product-trn-d-${measureId}`,
              name: 'TRN 750 - D',
              parentId: `category-transmission-${measureId}`,
              level: 3,
              type: 'product',
              values: monthlyValue(productBase),
            },
            {
              id: `product-trn-e-${measureId}`,
              name: 'TRN 750 - E',
              parentId: `category-transmission-${measureId}`,
              level: 3,
              type: 'product',
              values: monthlyValue(productBase),
            },
          ],
        },
        {
          id: `category-chassis-${measureId}`,
          name: 'Chassis Components',
          parentId: `account-${measureId}`,
          level: 2,
          type: 'category',
          values: monthlyValue(categoryBase),
          children: [
            {
              id: `product-chassis-1-${measureId}`,
              name: 'Chassis Product 1',
              parentId: `category-chassis-${measureId}`,
              level: 3,
              type: 'product',
              values: monthlyValue(productBase * 2.5),
            },
            {
              id: `product-chassis-2-${measureId}`,
              name: 'Chassis Product 2',
              parentId: `category-chassis-${measureId}`,
              level: 3,
              type: 'product',
              values: monthlyValue(productBase * 2.5),
            },
          ],
        },
      ],
    },
  ];
};

/**
 * Adjustment Measures Data
 * 
 * Dependencies:
 * - Baseline Forecast: Independent (base measure)
 * - Account Manager Adjusted Forecast: Depends on Baseline Forecast
 * - Sales Manager Adjusted Forecast: Depends on Account Manager Adjusted Forecast
 * - Regional Director Adjusted Forecast: Depends on Sales Manager Adjusted Forecast
 * - Final Forecast: Depends on Regional Director Adjusted Forecast (final aggregation)
 */
export const adjustmentMeasuresData: MeasureData[] = [
  // Baseline Forecast - Independent base measure
  {
    id: 'measure-baseline-forecast',
    name: 'Baseline Forecast',
    values: monthlyValue(85000),
    children: createHierarchy('measure-baseline-forecast', 85000, 42500, 8500),
  },
  // Account Manager Adjusted Forecast - Depends on Baseline Forecast
  {
    id: 'measure-account-manager-adjusted',
    name: 'Account Manager Adjusted Forecast',
    values: monthlyValue(87000), // Slightly higher than baseline
    children: createHierarchy('measure-account-manager-adjusted', 87000, 43500, 8700),
  },
  // Sales Manager Adjusted Forecast - Depends on Account Manager Adjusted Forecast
  {
    id: 'measure-sales-manager-adjusted',
    name: 'Sales Manager Adjusted Forecast',
    values: monthlyValue(89000), // Higher than Account Manager
    children: createHierarchy('measure-sales-manager-adjusted', 89000, 44500, 8900),
  },
  // Regional Director Adjusted Forecast - Depends on Sales Manager Adjusted Forecast
  {
    id: 'measure-regional-director-adjusted',
    name: 'Regional Director Adjusted Forecast',
    values: monthlyValue(92000), // Higher than Sales Manager
    children: createHierarchy('measure-regional-director-adjusted', 92000, 46000, 9200),
  },
  // Final Forecast - Depends on Regional Director Adjusted Forecast
  {
    id: 'measure-final-forecast',
    name: 'Final Forecast',
    values: monthlyValue(95000), // Highest value, final aggregation
    children: createHierarchy('measure-final-forecast', 95000, 47500, 9500),
  },
];




