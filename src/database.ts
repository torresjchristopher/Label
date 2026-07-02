import type { AlcoholProduct, ColaApplication } from './types';

// Standard Government Warning Text (mandatory on all alcohol labels)
export const STANDARD_GOVERNMENT_WARNING = 
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.";

export const POPULAR_PRODUCTS: AlcoholProduct[] = [
  {
    id: 'prod-1',
    brandName: 'OLD TOM DISTILLERY',
    classType: 'Kentucky Straight Bourbon Whiskey',
    abv: '45% Alc./Vol. (90 Proof)',
    volume: '750 mL',
    producer: 'Old Tom Distillery Co, Frankfort, KY',
    countryOfOrigin: 'United States',
    type: 'spirits'
  },
  {
    id: 'prod-2',
    brandName: "STONE'S THROW BREWING",
    classType: 'India Pale Ale (IPA)',
    abv: '6.8% Alc./Vol.',
    volume: '12 FL. OZ.',
    producer: 'Stone\'s Throw Brewing Co, Seattle, WA',
    countryOfOrigin: 'United States',
    type: 'beer'
  },
  {
    id: 'prod-3',
    brandName: 'CHATEAU BORDEAUX',
    classType: 'Bordeaux Red Wine',
    abv: '13.5% Alc. by Vol.',
    volume: '750 mL',
    producer: 'Chateau Bordeaux SA, Bordeaux, France',
    countryOfOrigin: 'France',
    type: 'wine'
  },
  {
    id: 'prod-4',
    brandName: 'GUINNESS DRAUGHT',
    classType: 'Stout / Dark Beer',
    abv: '4.2% Alc./Vol.',
    volume: '14.9 FL. OZ.',
    producer: 'Guinness & Co, Dublin, Ireland',
    countryOfOrigin: 'Ireland',
    type: 'beer'
  },
  {
    id: 'prod-5',
    brandName: "JACK DANIEL'S OLD NO. 7",
    classType: 'Tennessee Sour Mash Whiskey',
    abv: '40% Alc./Vol. (80 Proof)',
    volume: '750 mL',
    producer: 'Jack Daniel Distillery, Lynchburg, TN',
    countryOfOrigin: 'United States',
    type: 'spirits'
  },
  {
    id: 'prod-6',
    brandName: 'YELLOW TAIL',
    classType: 'Shiraz Red Wine',
    abv: '13.5% Alc. by Vol.',
    volume: '750 mL',
    producer: 'Casella Family Brands, Yenda, Australia',
    countryOfOrigin: 'Australia',
    type: 'wine'
  },
  {
    id: 'prod-7',
    brandName: 'GREY GOOSE',
    classType: 'Vodka',
    abv: '40% Alc./Vol.',
    volume: '750 mL',
    producer: 'Bacardi-Martini Corp, Cognac, France',
    countryOfOrigin: 'France',
    type: 'spirits'
  },
  {
    id: 'prod-8',
    brandName: 'JAMESON',
    classType: 'Irish Whiskey',
    abv: '40% Alc./Vol.',
    volume: '750 mL',
    producer: 'John Jameson & Son, Dublin, Ireland',
    countryOfOrigin: 'Ireland',
    type: 'spirits'
  },
  {
    id: 'prod-9',
    brandName: 'PATRON SILVER',
    classType: 'Tequila Silver',
    abv: '40% Alc./Vol.',
    volume: '750 mL',
    producer: 'The Patron Spirits Company, Jalisco, Mexico',
    countryOfOrigin: 'Mexico',
    type: 'spirits'
  },
  {
    id: 'prod-10',
    brandName: 'HEINEKEN',
    classType: 'Lager Beer',
    abv: '5.0% Alc./Vol.',
    volume: '12 FL. OZ.',
    producer: 'Heineken Brouwerijen, Amsterdam, Netherlands',
    countryOfOrigin: 'Netherlands',
    type: 'beer'
  },
  {
    id: 'prod-11',
    brandName: 'BUD LIGHT',
    classType: 'Light Lager Beer',
    abv: '4.2% Alc./Vol.',
    volume: '12 FL. OZ.',
    producer: 'Anheuser-Busch Inc, St. Louis, MO',
    countryOfOrigin: 'United States',
    type: 'beer'
  },
  {
    id: 'prod-12',
    brandName: 'CORONA EXTRA',
    classType: 'Mexican Lager Beer',
    abv: '4.6% Alc./Vol.',
    volume: '12 FL. OZ.',
    producer: 'Cervecería Modelo, Mexico City, Mexico',
    countryOfOrigin: 'Mexico',
    type: 'beer'
  }
];

export const MOCK_COLA_APPLICATIONS: ColaApplication[] = [
  {
    id: 'app-101',
    applicationNumber: 'COLA-2026-00871',
    brandName: 'OLD TOM DISTILLERY',
    classType: 'Kentucky Straight Bourbon Whiskey',
    abv: '45% Alc./Vol. (90 Proof)',
    volume: '750 mL',
    producer: 'Old Tom Distillery Co, Frankfort, KY',
    countryOfOrigin: 'United States',
    warningStatement: STANDARD_GOVERNMENT_WARNING,
    status: 'PENDING',
    labelUrl: '/old_tom_bourbon_label.jpg',
    applicantName: 'Old Tom Distillery Co.',
    submitDate: '2026-06-25',
    comments: 'Routine annual submission for the classic Kentucky straight Bourbon. Standard packaging.'
  },
  {
    id: 'app-102',
    applicationNumber: 'COLA-2026-00914',
    brandName: "Stone's Throw",
    classType: 'India Pale Ale (IPA)',
    abv: '6.8% Alc./Vol.',
    volume: '12 FL. OZ.',
    producer: 'Stone\'s Throw Brewing Co, Seattle, WA',
    countryOfOrigin: 'United States',
    warningStatement: STANDARD_GOVERNMENT_WARNING,
    status: 'PENDING',
    labelUrl: '/stones_throw_beer_label.jpg',
    applicantName: 'Stones Throw Brewing LLC',
    submitDate: '2026-06-28',
    comments: 'Brand name has slight casing difference in label art. Janet noted warning statement might have creative formatting.'
  },
  {
    id: 'app-103',
    applicationNumber: 'COLA-2026-00989',
    brandName: 'CHATEAU BORDEAUX',
    classType: 'Bordeaux Red Wine',
    abv: '13.5% Alc. by Vol.',
    volume: '750 mL',
    producer: 'Chateau Bordeaux SA, Bordeaux, France',
    countryOfOrigin: 'France',
    warningStatement: STANDARD_GOVERNMENT_WARNING,
    status: 'PENDING',
    labelUrl: '/chateau_bordeaux_label.jpg',
    applicantName: 'Global Import Partners',
    submitDate: '2026-06-29',
    comments: 'Wine importer batch. Verify that the label ABV matches the 13.5% stated on the form.'
  },
  {
    id: 'app-104',
    applicationNumber: 'COLA-2026-01041',
    brandName: 'GUINNESS DRAUGHT',
    classType: 'Stout / Dark Beer',
    abv: '4.2% Alc./Vol.',
    volume: '14.9 FL. OZ.',
    producer: 'Guinness & Co, Dublin, Ireland',
    countryOfOrigin: 'Ireland',
    warningStatement: STANDARD_GOVERNMENT_WARNING,
    status: 'PENDING',
    applicantName: 'Diageo Import North America',
    submitDate: '2026-06-30',
    comments: 'Standard import application. Requires verification of importer address and warning text layout.'
  },
  {
    id: 'app-105',
    applicationNumber: 'COLA-2026-01112',
    brandName: "JACK DANIEL'S OLD NO. 7",
    classType: 'Tennessee Sour Mash Whiskey',
    abv: '40% Alc./Vol. (80 Proof)',
    volume: '750 mL',
    producer: 'Jack Daniel Distillery, Lynchburg, TN',
    countryOfOrigin: 'United States',
    warningStatement: STANDARD_GOVERNMENT_WARNING,
    status: 'PENDING',
    applicantName: 'Brown-Forman Corporation',
    submitDate: '2026-07-01',
    comments: 'Check label text for warning text conformity. Some batches flagged for slight typography edits in warning.'
  },
  {
    id: 'app-106',
    applicationNumber: 'COLA-2026-01205',
    brandName: 'YELLOW TAIL',
    classType: 'Shiraz Red Wine',
    abv: '13.5% Alc. by Vol.',
    volume: '750 mL',
    producer: 'Casella Family Brands, Yenda, Australia',
    countryOfOrigin: 'Australia',
    warningStatement: STANDARD_GOVERNMENT_WARNING,
    status: 'PENDING',
    applicantName: 'Deutsch Family Wine & Spirits',
    submitDate: '2026-07-01',
    comments: 'Imported Australian Shiraz. Check for correct importer label overlay and origin details.'
  }
];
