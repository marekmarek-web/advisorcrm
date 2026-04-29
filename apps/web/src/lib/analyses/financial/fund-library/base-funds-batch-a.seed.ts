/**
 * Batch A — surový seed zkopírovaný z oficiálních zdrojů (viz dokumentace v /docs).
 * Mapování do `BaseFund` dělá base-funds-batch-a.ts.
 */

export type BatchASeedSource = {
  label: string;
  url: string;
  kind: "landing_page" | "factsheet" | "kid" | "report" | "documents";
};

export type BatchASeedRow = {
  baseFundKey: string;
  canonicalName: string;
  displayName: string;
  provider: string;
  manager: string;
  category: string;
  subcategory?: string;
  currency?: string;
  isin?: string | null;
  ticker?: string | null;
  riskSRI?: number | null;
  goal?: string;
  strategy?: string;
  description?: string;
  suitable?: string;
  horizon?: string;
  liquidity?: string;
  risks?: string;
  minInvestment?: string | null;
  planningRate?: number | null;
  officialPerformance?: {
    ytd?: string | null;
    oneYear?: string | null;
    threeYearPA?: string | null;
    fiveYearPA?: string | null;
    tenYearPA?: string | null;
    sinceInceptionPA?: string | null;
    asOf?: string | null;
  };
  benefits?: string[];
  parameters?: Record<string, string>;
  topHoldings?: string[];
  countries?: string[];
  sectors?: string[];
  morningstarRating?: string | null;
  awards?: string[];
  factsheetUrl?: string | null;
  factsheetAsOf?: string | null;
  verifiedAt?: string | null;
  logo?: string;
  heroImage?: string;
  galleryImages?: string[];
  /** `"logo"` = sada značek/partnerů (bílé pozadí, padding); default `"photo"`. */
  galleryType?: "photo" | "logo";
  sources: BatchASeedSource[];
  assetTodo: string[];
  notes?: string[];
};

/**
 * Batch A = seed s reálnými daty pro první 4 fondy.
 *
 * Důležité:
 * - `officialPerformance` = oficiální historická výkonnost z factsheetů / product pages.
 * - `planningRate` = interní modelový předpoklad pro projekce v Aidvisoře, NENÍ oficiální výkonnost.
 * - `suitable`, `horizon`, `liquidity` a část `description` jsou editoriální texty pro UX/PDF a mají projít business/compliance revizí.
 * - `galleryImages` jsou jen cílové asset cesty; samotné vizuály je potřeba doplnit do asset knihovny.
 */
export const BATCH_A_SEED_ROWS: readonly BatchASeedRow[] = [
  {
    baseFundKey: 'ishares_core_msci_world',
    canonicalName: 'iShares Core MSCI World UCITS ETF',
    displayName: 'iShares Core MSCI World',
    provider: 'BlackRock / iShares',
    manager: 'BlackRock',
    category: 'ETF',
    subcategory: 'Akciový / Globální developed markets',
    currency: 'USD',
    isin: 'IE00B4L5Y983',
    ticker: 'SWDA',
    riskSRI: null,
    goal:
      'Fond kopíruje světový akciový index MSCI World. Peníze se tak rozdělí mezi velké a střední firmy z rozvinutých zemí světa.',
    strategy:
      'Fond jednotlivé akcie sám nevybírá – kopíruje složení světového indexu a fyzicky drží podíly těchto firem.',
    description:
      'Základní celosvětový akciový fond pro dlouhodobé investování. Hodí se jako hlavní růstová složka portfolia.',
    suitable:
      'Pro investory, kteří chtějí mít jednoduše zastoupeny firmy z celého rozvinutého světa a nechtějí si sami vybírat konkrétní akcie.',
    horizon: '7+ let',
    liquidity: 'Fond se obchoduje na burze každý den, takže peníze lze relativně rychle získat zpět.',
    risks:
      'Hodnota akcií kolísá podle vývoje trhů, ekonomiky a výsledků firem. Přidává se také riziko změny kurzu dolaru vůči koruně.',
    minInvestment: null,
    planningRate: 8,
    officialPerformance: {
      ytd: '2.99%',
      oneYear: '21.41%',
      threeYearPA: '20.63%',
      fiveYearPA: '12.54%',
      tenYearPA: null,
      sinceInceptionPA: '10.90%',
      asOf: '2026-02-28',
    },
    benefits: [
      'Expozice vůči široké škále společností z rozvinutých trhů v jediném ETF.',
      'Vhodné jako core růstová složka portfolia.',
      'Nízké průběžné náklady oproti řadě aktivně řízených globálních fondů.',
    ],
    parameters: {
      benchmark: 'MSCI World Index (Net)',
      ocf: '0.20%',
      shareClassAssets: '132,181.88 mil. USD',
      fundAssets: '135,903.96 mil. USD',
      methodology: 'Optimalizováno',
      structure: 'Fyzické',
      domicile: 'Irsko',
      shareClassLaunch: '2009-09-25',
      fundLaunch: '2009-09-25',
      holdingsCount: '1,309',
      priceToBook: '3.79x',
      priceToEarningsTTM: '24.76x',
      beta3Y: '1.00',
    },
    topHoldings: [
      'NVIDIA 5.04%',
      'Apple 4.55%',
      'Microsoft 3.25%',
      'Amazon 2.37%',
      'Alphabet A 2.13%',
      'Alphabet C 1.78%',
      'Broadcom 1.69%',
      'Meta Platforms A 1.65%',
      'Tesla 1.33%',
      'Eli Lilly 0.99%',
    ],
    countries: [],
    sectors: [],
    morningstarRating: null,
    awards: [],
    factsheetUrl:
      'https://www.blackrock.com/cz/individualni-investori/literature/fact-sheet/swda-ishares-core-msci-world-ucits-etf-fund-fact-sheet-cs-cz.pdf',
    factsheetAsOf: '2026-02-28',
    verifiedAt: '2026-04-05',
    logo: '/logos/funds/ishares_brand.png',
    heroImage: '/report-assets/funds/ishares_core_msci_world/hero.svg',
    galleryType: 'logo',
    galleryImages: [
      '/report-assets/msci/msci1.png',
      '/report-assets/msci/msci2.png',
      '/report-assets/msci/msci3.png',
    ],
    sources: [
      {
        label: 'Official product page',
        url: 'https://www.blackrock.com/uk/individual/products/251882/ishares-msci-world-ucits-etf-acc-fund',
        kind: 'landing_page',
      },
      {
        label: 'Official Czech factsheet',
        url: 'https://www.blackrock.com/cz/individualni-investori/literature/fact-sheet/swda-ishares-core-msci-world-ucits-etf-fund-fact-sheet-cs-cz.pdf',
        kind: 'factsheet',
      },
    ],
    assetTodo: ['logo', 'hero'],
    notes: [
      'World ETF alias mapovat pouze sem.',
      'BlackRock factsheet v parsovaném textu sice ukazuje sekce sektorů, ale nevyčetl jejich hodnoty; doplnit z product page holdings/analytics view nebo screenshotem.',
      'planningRate 8 % je interní modelový předpoklad pro projekce, ne oficiální performance.',
    ],
  },
  {
    baseFundKey: 'ishares_core_sp_500',
    canonicalName: 'iShares Core S&P 500 UCITS ETF',
    displayName: 'iShares Core S&P 500',
    provider: 'BlackRock / iShares',
    manager: 'BlackRock',
    category: 'ETF',
    subcategory: 'Akciový / USA large cap',
    currency: 'USD',
    isin: 'IE00B5BMR087',
    ticker: 'CSPX',
    riskSRI: null,
    goal:
      'Fond se snaží sledovat výkonnost indexu S&P 500 Index, tedy 500 velkých amerických společností.',
    strategy:
      'Pasivní ETF s fyzickou replikací zaměřený na velké americké firmy.',
    description:
      'Koncentrovanější americká akciová složka vhodná pro investory, kteří chtějí čistou expozici na velké americké společnosti.',
    suitable:
      'Pro investory, kteří chtějí dlouhodobě těžit z výkonu velkých amerických firem a akceptují vyšší koncentraci na USA.',
    horizon: '7+ let',
    liquidity: 'Burzovně obchodovaný UCITS ETF; běžná tržní likvidita.',
    risks:
      'Hodnota akcií může výrazně kolísat podle vývoje amerického trhu, firemních výsledků a makroekonomiky. Přítomné je i měnové a protistranové riziko.',
    minInvestment: null,
    planningRate: 9,
    officialPerformance: {
      ytd: '0.64%',
      oneYear: '16.70%',
      threeYearPA: '21.48%',
      fiveYearPA: '13.88%',
      tenYearPA: null,
      sinceInceptionPA: '13.91%',
      asOf: '2026-02-28',
    },
    benefits: [
      'Přímá expozice vůči 500 předním americkým společnostem.',
      'Vhodné jako core USA equity složka portfolia.',
      'Velmi nízké průběžné náklady.',
    ],
    parameters: {
      benchmark: 'S&P 500 Index',
      ocf: '0.07%',
      shareClassAssets: '134,372.25 mil. USD',
      fundAssets: '138,478.20 mil. USD',
      methodology: 'Fyzická replikace',
      structure: 'Fyzické',
      domicile: 'Irsko',
      shareClassLaunch: '2010-05-19',
      fundLaunch: '2010-05-18',
      holdingsCount: '503',
      priceToBook: '5.12x',
      priceToEarningsTTM: '27.72x',
      beta3Y: '1.00',
    },
    topHoldings: [
      'NVIDIA 7.31%',
      'Apple 6.63%',
      'Microsoft 4.96%',
      'Amazon 3.47%',
      'Alphabet A 3.08%',
      'Broadcom 2.56%',
      'Alphabet C 2.46%',
      'Meta Platforms A 2.40%',
      'Tesla 1.92%',
      'Berkshire Hathaway B 1.57%',
    ],
    countries: ['USA'],
    sectors: [],
    morningstarRating: null,
    awards: [],
    factsheetUrl:
      'https://www.blackrock.com/cz/individualni-investori/literature/fact-sheet/cspx-ishares-core-s-p-500-ucits-etf-fund-fact-sheet-cs-cz.pdf',
    factsheetAsOf: '2026-02-28',
    verifiedAt: '2026-04-05',
    logo: '/logos/funds/ishares_brand.png',
    heroImage: '/report-assets/funds/ishares_core_sp_500/hero.svg',
    galleryImages: [
      '/report-assets/funds/ishares_core_sp_500/gallery-1.svg',
      '/report-assets/funds/ishares_core_sp_500/gallery-2.svg',
      '/report-assets/funds/ishares_core_sp_500/gallery-3.svg',
    ],
    sources: [
      {
        label: 'Official product page',
        url: 'https://www.blackrock.com/uk/individual/products/253743/ishares-sp-500-b-ucits-etf-acc-fund',
        kind: 'landing_page',
      },
      {
        label: 'Official Czech factsheet',
        url: 'https://www.blackrock.com/cz/individualni-investori/literature/fact-sheet/cspx-ishares-core-s-p-500-ucits-etf-fund-fact-sheet-cs-cz.pdf',
        kind: 'factsheet',
      },
    ],
    assetTodo: ['logo', 'hero', 'gallery-1', 'gallery-2', 'gallery-3'],
    notes: [
      'Sektorové váhy doplnit z holdings/analytics view nebo screenshotem z product page.',
      'planningRate 9 % je interní modelový předpoklad pro projekce, ne oficiální performance.',
    ],
  },
  {
    baseFundKey: 'vanguard_ftse_emerging_markets',
    canonicalName: 'Vanguard FTSE Emerging Markets UCITS ETF',
    displayName: 'Vanguard FTSE Emerging Markets',
    provider: 'Vanguard',
    manager: 'Vanguard',
    category: 'ETF',
    subcategory: 'Akciový / Emerging markets',
    currency: 'USD',
    isin: 'IE00BK5BR733',
    ticker: 'VFEG',
    riskSRI: 6,
    goal:
      'Fond pasivně sleduje FTSE Emerging Index, tedy velké a středně velké společnosti z rozvíjejících se trhů.',
    strategy:
      'Pasivní indexový ETF s fyzickou akvizicí cenných papírů a samplingem tam, kde není plná replikace praktická.',
    description:
      'Široce diverzifikovaná emerging markets equity složka vhodná jako doplněk k developed world expozici.',
    suitable:
      'Pro investory, kteří chtějí přidat růstový potenciál rozvíjejících se trhů a akceptují vyšší volatilitu i politická a měnová rizika.',
    horizon: '7+ let',
    liquidity: 'Burzovně obchodovaný UCITS ETF; běžná tržní likvidita.',
    risks:
      'Emerging markets bývají citlivější na ekonomické a politické podmínky, mohou mít nižší likviditu a vyšší měnové riziko. Přítomné je také tracking a protistranové riziko.',
    minInvestment: null,
    planningRate: 8,
    officialPerformance: {
      ytd: '8.27%',
      oneYear: '34.18%',
      threeYearPA: '17.85%',
      fiveYearPA: '5.27%',
      tenYearPA: null,
      sinceInceptionPA: '8.70%',
      asOf: '2026-02-28',
    },
    benefits: [
      'Široká expozice vůči velkým a středním společnostem z emerging markets.',
      'Dává smysl jako doplněk k developed world ETF.',
      'Nízké průběžné náklady v rámci EM expozice.',
    ],
    parameters: {
      benchmark: 'FTSE Emerging Index',
      ocf: '0.17%',
      totalAssets: '5,518 mil. USD',
      shareClassAssets: '2,052 mil. USD',
      structure: 'UCITS / Ireland',
      method: 'Physical',
      shareClassLaunch: '2019-09-24',
      holdingsCount: '2,288',
      medianMarketCap: '41.4 mld. USD',
      pe: '16.9x',
      pb: '2.6x',
      roe: '16.5%',
      earningsGrowthRate: '16.6%',
      turnoverRate: '-17%',
      equityYield: '2.3%',
    },
    topHoldings: [
      'Taiwan Semiconductor Manufacturing 15.0%',
      'Tencent 4.0%',
      'Alibaba Group 3.2%',
      'HDFC Bank 1.1%',
      'Reliance Industries 1.0%',
      'Hon Hai Precision Industry 0.9%',
      'MediaTek 0.9%',
      'China Construction Bank 0.9%',
      'Delta Electronics 0.9%',
      'ICICI Bank 0.8%',
    ],
    countries: [
      'Čína 30.1%',
      'Tchaj-wan 26.1%',
      'Indie 16.9%',
      'Brazílie 4.8%',
      'Jižní Afrika 4.7%',
      'Saúdská Arábie 3.3%',
      'Mexiko 2.5%',
      'Spojené arabské emiráty 1.8%',
      'Thajsko 1.7%',
      'Malajsie 1.6%',
    ],
    sectors: [
      'Technologie 30.7%',
      'Finance 22.0%',
      'Consumer Discretionary 10.5%',
      'Průmysl 8.1%',
      'Základní materiály 7.7%',
      'Energie 4.9%',
      'Telekomunikace 4.1%',
      'Consumer Staples 3.8%',
      'Health Care 3.3%',
      'Utilities 3.0%',
      'Reality 1.9%',
    ],
    morningstarRating: null,
    awards: [],
    factsheetUrl:
      'https://fund-docs.vanguard.com/FTSE_Emerging_Markets_UCITS_ETF_USD_Accumulating_9678_EU_INT_UK_EN.pdf',
    factsheetAsOf: '2026-02-28',
    verifiedAt: '2026-04-05',
    logo: '/logos/funds/vanguard_ftse_emerging_markets.png',
    heroImage: '/report-assets/funds/vanguard_ftse_emerging_markets/hero.svg',
    galleryImages: [
      '/report-assets/funds/vanguard_ftse_emerging_markets/gallery-1.svg',
      '/report-assets/funds/vanguard_ftse_emerging_markets/gallery-2.svg',
      '/report-assets/funds/vanguard_ftse_emerging_markets/gallery-3.svg',
    ],
    sources: [
      {
        label: 'Official product page',
        url: 'https://www.vanguard.co.uk/professional/product/etf/equity/9678/ftse-emerging-markets-ucits-etf-usd-accumulating',
        kind: 'landing_page',
      },
      {
        label: 'Official factsheet',
        url: 'https://fund-docs.vanguard.com/FTSE_Emerging_Markets_UCITS_ETF_USD_Accumulating_9678_EU_INT_UK_EN.pdf',
        kind: 'factsheet',
      },
    ],
    assetTodo: ['logo', 'hero', 'gallery-1', 'gallery-2', 'gallery-3'],
    notes: [
      'planningRate 8 % je interní modelový předpoklad pro projekce, ne oficiální performance.',
      'Vizuály galerie doporučeno řešit jako branded tiles: TSMC / Tencent / Alibaba nebo regionální map cards, ne nejasné stock fotky.',
    ],
  },
  {
    baseFundKey: 'ishares_core_global_aggregate_bond',
    canonicalName: 'iShares Core Global Aggregate Bond UCITS ETF',
    displayName: 'iShares Core Global Aggregate Bond',
    provider: 'BlackRock / iShares',
    manager: 'BlackRock',
    category: 'ETF',
    subcategory: 'Dluhopisový / Globální investment grade',
    currency: 'EUR',
    isin: 'IE00BDBRDM35',
    ticker: 'AGGH',
    riskSRI: null,
    goal:
      'Fond se snaží sledovat index složený z globálních dluhopisů investičního stupně napříč státními, agenturními, podnikovými a sekuritizovanými dluhopisy.',
    strategy:
      'Pasivní globální bond ETF s měnovým zajištěním do EUR a sampling metodologií.',
    description:
      'Široce diverzifikovaná dluhopisová složka pro stabilizační část portfolia s expozicí na globální investment grade bondy.',
    suitable:
      'Pro investory, kteří chtějí do portfolia přidat konzervativnější globální dluhopisovou složku a snížit celkovou volatilitu.',
    horizon: '3+ let',
    liquidity: 'Burzovně obchodovaný UCITS ETF; běžná tržní likvidita.',
    risks:
      'Na fond mají významný vliv změny úrokových sazeb, úvěrové riziko emitentů a protistranové riziko. Přestože jde o investment grade dluhopisy, jejich ceny mohou kolísat.',
    minInvestment: null,
    planningRate: 4,
    officialPerformance: {
      ytd: '1.36%',
      oneYear: '2.58%',
      threeYearPA: '3.27%',
      fiveYearPA: '-1.01%',
      tenYearPA: null,
      sinceInceptionPA: '0.00%',
      asOf: '2026-02-28',
    },
    benefits: [
      'Přímá expozice na státní, quasi-government, corporate a securitised dluhopisy.',
      'Diverzifikace vůči globálnímu trhu s pevným výnosem.',
      'Investment grade profil vhodný pro stabilizační část portfolia.',
    ],
    parameters: {
      benchmark: 'BBG Global Aggregate Index (USD)',
      ocf: '0.10%',
      shareClassAssets: '2,382.60 mil. EUR',
      fundAssets: '13,970.21 mil. USD',
      baseCurrency: 'USD',
      shareClassCurrency: 'EUR hedged',
      methodology: 'Vzorek',
      structure: 'Fyzické',
      domicile: 'Irsko',
      shareClassLaunch: '2017-11-21',
      fundLaunch: '2017-11-21',
      holdingsCount: '19,977',
      weightedAverageMaturity: '8.11 roku',
      effectiveDuration: '6.23 roku',
      standardDeviation3Y: '4.00%',
      beta3Y: '0.55',
      ytm: '3.42%',
    },
    topHoldings: [
      'United States Treasury 18.94%',
      'Japan (Government of) 7.85%',
      'China People’s Republic of (Government) 5.80%',
      'Federal Home Loan Mortgage Corporation 3.22%',
      'Federal National Mortgage Association 3.01%',
      'France (Republic of) 2.85%',
      'UK Conv Gilt 2.69%',
      'Italy (Republic of) 2.66%',
      'China Development Bank 2.35%',
      'Government National Mortgage Association II 2.31%',
    ],
    countries: [
      'USA',
      'Japonsko',
      'Čína',
      'Francie',
      'Velká Británie',
      'Itálie',
    ],
    sectors: [
      'Státní dluhopisy',
      'S dluhy spojené s vládou / agency',
      'Podnikové dluhopisy',
      'Sekuritizované dluhopisy',
    ],
    morningstarRating: null,
    awards: [],
    factsheetUrl:
      'https://www.blackrock.com/cz/individualni-investori/literature/fact-sheet/aggh-ishares-core-global-aggregate-bond-ucits-etf-fund-fact-sheet-cs-cz.pdf',
    factsheetAsOf: '2026-02-28',
    verifiedAt: '2026-04-05',
    logo: '/logos/funds/ishares_brand.png',
    heroImage: '/report-assets/funds/ishares_core_global_aggregate_bond/hero.svg',
    galleryImages: [
      '/report-assets/funds/ishares_core_global_aggregate_bond/gallery-1.svg',
      '/report-assets/funds/ishares_core_global_aggregate_bond/gallery-2.svg',
      '/report-assets/funds/ishares_core_global_aggregate_bond/gallery-3.svg',
    ],
    sources: [
      {
        label: 'Official product page',
        url: 'https://www.blackrock.com/uk/individual/products/291770/ishares-core-global-aggregate-bond-ucits-etf',
        kind: 'landing_page',
      },
      {
        label: 'Official Czech factsheet',
        url: 'https://www.blackrock.com/cz/individualni-investori/literature/fact-sheet/aggh-ishares-core-global-aggregate-bond-ucits-etf-fund-fact-sheet-cs-cz.pdf',
        kind: 'factsheet',
      },
    ],
    assetTodo: ['logo', 'hero', 'gallery-1', 'gallery-2', 'gallery-3'],
    notes: [
      'planningRate 4 % je interní modelový předpoklad pro projekce, ne oficiální performance.',
      'Grafické sektorové, maturity a credit-rating breakdowny jdou do budoucna vytáhnout screenshotem z factsheetu nebo product page a převést do branded tiles.',
    ],
  },
];
