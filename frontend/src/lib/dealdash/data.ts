import { promises as fs } from "node:fs";
import path from "node:path";
import { parseCsvText } from "./csv";
import {
  createId,
  detectImportType,
  normalizeFollowUpRow,
  normalizeImportedRows,
  normalizePipelineRow,
  normalizeFundedRow,
} from "./normalization";
import type { FollowUpItem, FundedDeal, ImportBatch, PipelineDeal, SeedDataset } from "./types";

// ─── CSV file loader (local dev only) ────────────────────────────────────────

async function readCsvFiles(importDir: string) {
  try {
    const entries = await fs.readdir(importDir, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && /\.(csv|tsv)$/i.test(e.name))
      .map((e) => e.name);

    return Promise.all(
      files.map(async (filename) => {
        const content = await fs.readFile(path.join(importDir, filename), "utf8");
        return { filename, ...parseCsvText(content) };
      }),
    );
  } catch {
    return [];
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────
// Tries to load CSVs from data/imports/ (works locally).
// Falls back to the hardcoded real dataset which is always correct on Vercel.

export async function loadSeedDataset(): Promise<SeedDataset> {
  const importDir = path.join(process.cwd(), "..", "data", "imports");
  const loadedFiles = await readCsvFiles(importDir);

  const fundedDeals: FundedDeal[] = [];
  const pipelineDeals: PipelineDeal[] = [];
  const followUps: FollowUpItem[] = [];
  const importBatches: ImportBatch[] = [];

  for (const file of loadedFiles) {
    const headerSet = new Set(file.headers);
    const src = file.filename;

    if (headerSet.has("Amount") && headerSet.has("Funder")) {
      file.rows.forEach((row, i) => fundedDeals.push(normalizeFundedRow(row, src, i)));
      importBatches.push({ id: createId("import", src, 0), filename: src, importType: "funded", rowsImported: file.rows.length, rowsSkipped: 0, detectedColumns: file.headers, importedAt: new Date().toISOString() });
      continue;
    }
    if (headerSet.has("Date App") && headerSet.has("Business")) {
      file.rows.forEach((row, i) => pipelineDeals.push(normalizePipelineRow(row, src, i)));
      importBatches.push({ id: createId("import", src, 0), filename: src, importType: "pipeline", rowsImported: file.rows.length, rowsSkipped: 0, detectedColumns: file.headers, importedAt: new Date().toISOString() });
      continue;
    }
    if (headerSet.has("Full name") && headerSet.has("Date Last Contacted")) {
      file.rows.forEach((row, i) => followUps.push(normalizeFollowUpRow(row, src, i)));
      importBatches.push({ id: createId("import", src, 0), filename: src, importType: "follow-up", rowsImported: file.rows.length, rowsSkipped: 0, detectedColumns: file.headers, importedAt: new Date().toISOString() });
    }
  }

  if (fundedDeals.length || pipelineDeals.length || followUps.length) {
    return { fundedDeals, pipelineDeals, followUps, importBatches, sourceMode: "csv" };
  }

  // Vercel fallback — real hardcoded dataset
  return createRealDataset();
}

export { detectImportType, normalizeFollowUpRow, normalizeFundedRow, normalizeImportedRows, normalizePipelineRow };

// ─── Hardcoded real dataset (Vercel-safe fallback) ───────────────────────────
// All data is sourced from the 9 CSV files. housePointsPercent defaults to 0
// so the broker can fill it in per deal to model their commission correctly.

export function createRealDataset(): SeedDataset {
  _pIdx = 0; // reset on every call so IDs are stable across warm-start invocations

  // ── Funded deals (Ethan Funded Deals - Sheet1.csv) ──────────────────────
  /**
   * Keep the Vercel-safe funded fallback in CSV-shaped rows so normalization
   * stays identical to the uploaded source sheet, including source spelling.
   */
  const fundedDeals: FundedDeal[] = [
    { Date: "12/30/2025", "Business Name": "Synchronized Strategies LLC", Name: "Anil Mahase", Number: "(908) 415-0665", Email: "mahaseanil@gmail.com", Amount: "$60,000.00", Rate: "1.5", Term: "45", "Term Unit": "Days", Payment: "$2,000.00", Funder: "Limitless Advance", Syndication: "0%", Commission: "$2,160.00", Status: "Slow payments" },
    { Date: "2/5/2026", "Business Name": "H&R Home Health Care", Name: "Tiffany Hogan", Number: "(317) 992-3236", Email: "tiffanyhogan87@gmail.com", Amount: "$30,000.00", Rate: "1.49", Term: "50", "Term Unit": "Days", Payment: "$894.00", Funder: "Kapfi", Syndication: "0%", Commission: "$900.00", Status: "Paid out" },
    { Date: "2/6/2026", "Business Name": "H&R Home Health Care", Name: "Tiffany Hogan", Number: "(317) 992-3236", Email: "tiffanyhogan87@gmail.com", Amount: "$20,000.00", Rate: "1.49", Term: "50", "Term Unit": "Days", Payment: "$596.00", Funder: "Avanza", Syndication: "0%", Commission: "$720.00", Status: "Paid Out" },
    { Date: "2/6/2026", "Business Name": "Feed Barn Costa Mesa", Name: "Michael Hilterbrand", Number: "(949) 610-5457", Email: "info@feedbarncostamesa.com", Amount: "$30,000.00", Rate: "1.19", Term: "18", "Term Unit": "Weeks", Payment: "$1,983.33", Funder: "Sqaure", Syndication: "0%", Commission: "$270.00", Status: "Paid Out (EPA)" },
    { Date: "2/10/2026", "Business Name": "Puroclean of Broken Arrow", Name: "James Hoover", Number: "(918) 574-1484", Email: "jhoover@puroclean.com", Amount: "$75,000.00", Rate: "1.32", Term: "48", "Term Unit": "Weeks", Payment: "$2,062.50", Funder: "LG", Syndication: "0%", Commission: "$1,755.00", Status: "Paid Out" },
    { Date: "2/19/2026", "Business Name": "H&R Home Health Care", Name: "Tiffany Hogan", Number: "(317) 992-3236", Email: "tiffanyhogan87@gmail.com", Amount: "$20,000.00", Rate: "1.5", Term: "20", "Term Unit": "Days", Payment: "$1,500.00", Funder: "Parkview", Syndication: "0%", Commission: "$720.00", Status: "Paid Out" },
    { Date: "2/20/2026", "Business Name": "JBJ Lighting Services", Name: "Joseph Brian Johns", Number: "(941) 667-0585", Email: "brian johns", Amount: "$35,000.00", Rate: "1.5", Term: "42", "Term Unit": "Weeks", Payment: "$1,250.00", Funder: "Expansion", Syndication: "0%", Commission: "$840.00", Status: "Paid Out" },
    { Date: "3/5/2026", "Business Name": "H&R Home Health Care", Name: "Tiffany Hogan", Number: "(317) 992-3236", Email: "tiffanyhogan87@gmail.com", Amount: "$20,000.00", Rate: "1.5", Term: "20", "Term Unit": "Days", Payment: "$1,500.00", Funder: "Denali", Syndication: "0%", Commission: "$720.00", Status: "POCB" },
    { Date: "3/12/2026", "Business Name": "Rescue MD PLLC", Name: "Tochi Okoro", Number: "(313) 649-1867", Email: "tochiokoro@myrescuemd.com", Amount: "$50,000.00", Rate: "1.38", Term: "24", "Term Unit": "Weeks", Payment: "$2,875.00", Funder: "W", Syndication: "0%", Commission: "$540.00", Status: "Paid Out + CB" },
    { Date: "3/16/2026", "Business Name": "Puroclean of Broken Arrow", Name: "James Hoover", Number: "(918) 574-1484", Email: "jhoover@puroclean.com", Amount: "$50,000.00", Rate: "1.32", Term: "40", "Term Unit": "Weeks", Payment: "$1,650.00", Funder: "LG", Syndication: "0%", Commission: "$1,188.00", Status: "Paid Out" },
    { Date: "3/23/2026", "Business Name": "H&R Home Health Care", Name: "Tiffany Hogan", Number: "(317) 992-3236", Email: "tiffanyhogan87@gmail.com", Amount: "$50,000.00", Rate: "1.56", Term: "60", "Term Unit": "Days", Payment: "$1,300.00", Funder: "Avanza", Syndication: "0%", Commission: "-$2,400.00", Status: "CB" },
    { Date: "3/25/2026", "Business Name": "Conexco INC", Name: "Edward Hamilton", Number: "(219) 628-6164", Email: "ed@conexcoinc.com", Amount: "$250,000.00", Rate: "1.4", Term: "18", "Term Unit": "Weeks", Payment: "$19,444.44", Funder: "Pinnacle (Avion synd)", Syndication: "0%", Commission: "$4,500.00", Status: "Paid Out" },
    { Date: "4/17/2026", "Business Name": "Rescue MD PLLC", Name: "Tochi Okoro", Number: "(313) 649-1867", Email: "tochiokoro@myrescuemd.com", Amount: "$50,000.00", Rate: "1.4", Term: "18", "Term Unit": "Weeks", Payment: "$3,888.89", Funder: "X Capital", Syndication: "0%", Commission: "$1,050.00", Status: "Paid Out" },
    { Date: "5/1/2026", "Business Name": "Duncan LLC", Name: "Melissa Duncan", Number: "(540) 974-1399", Email: "shenandoahvalley.owner@mrelectric.com", Amount: "$5,500.00", Rate: "1.69", Term: "75", "Term Unit": "Days", Payment: "$123.93", Funder: "ZLUR", Syndication: "0%", Commission: "$381.00", Status: "Paid Out" },
    { Date: "5/1/2026", "Business Name": "Remote Better LLC", Name: "Karthik Ranganathan", Number: "(214) 906-7807", Email: "info@remotebetter.ai", Amount: "$150,000.00", Rate: "1.4", Term: "34", "Term Unit": "Weeks", Payment: "$6,176.47", Funder: "ENOD via Yashard", Syndication: "0%", Commission: "$3,600.00", Status: "Paid Out" },
    { Date: "5/1/2026", "Business Name": "Blue Lagune Therapy", Name: "Trish Biasotti", Number: "(713) 376-1343", Email: "info@bluelagunetherapy.com", Amount: "$300,000.00", Rate: "1.45", Term: "24", "Term Unit": "Weeks", Payment: "$18,125.00", Funder: "Parkside via Yashard", Syndication: "0%", Commission: "$6,300.00", Status: "Paid Out" },
    { Date: "5/5/2026", "Business Name": "Rescue MD PLLC", Name: "Tochi Okoro", Number: "(313) 649-1867", Email: "tochiokoro@myrescuemd.com", Amount: "$50,000.00", Rate: "1.45", Term: "18", "Term Unit": "Weeks", Payment: "$4,027.78", Funder: "ENOD via Yashard", Syndication: "0%", Commission: "$240.00", Status: "Paid Out+CB" },
    { Date: "5/15/2026", "Business Name": "Puroclean of Broken Arrow", Name: "James Hoover", Number: "(918) 574-1484", Email: "jhoover@puroclean.com", Amount: "$222,000.00", Rate: "", Term: "20 Weeks", "Term Unit": "", Payment: "#VALUE!", Funder: "BizPointCap (Reverse)", Syndication: "0%", Commission: "$2,124.84", Status: "Paid Out" },
    { Date: "5/26/2026", "Business Name": "Blue Lagune Therapy", Name: "Trish Biasotti", Number: "(713) 376-1343", Email: "biasotti2026@gmail.com", Amount: "$385,000.00", Rate: "", Term: "", "Term Unit": "", Payment: "#DIV/0!", Funder: "Figure (HELOC)", Syndication: "0%", Commission: "$7,564.96", Status: "Paid Out" },
    { Date: "5/27/2026", "Business Name": "Cason Unlimited", Name: "Kevin Cason", Number: "(540) 426-9333", Email: "kevin@pacificlasales.com", Amount: "$10,000.00", Rate: "1.5", Term: "30", "Term Unit": "Days", Payment: "$500.00", Funder: "Woodmere", Syndication: "0%", Commission: "$660.00", Status: "Clawback" },
    { Date: "5/28/2026", "Business Name": "Sato Solution", Name: "Sandro Toledo", Number: "(978) 596-7033", Email: "sato.solution23@gmail.com", Amount: "$40,000.00", Rate: "1.5", Term: "12.5", "Term Unit": "Weeks", Payment: "$4,800.00", Funder: "Limitless Advance", Syndication: "10%", Commission: "$3,200.00", Status: "" },
    { Date: "6/11/2026", "Business Name": "Sato Solution", Name: "Sandro Toledo", Number: "(978) 596-7033", Email: "sato.solution23@gmail.com", Amount: "$20,000.00", Rate: "1.5", Term: "14", "Term Unit": "Weeks", Payment: "$2,142.86", Funder: "Limitless Advance", Syndication: "5%", Commission: "$1,220.00", Status: "" },
    { Date: "6/17/2026", "Business Name": "Engage Labs LLC", Name: "Lynn Wills", Number: "(845) 321-1928", Email: "lwills@engagelabsllc.com", Amount: "$40,000.00", Rate: "1.45", Term: "40", "Term Unit": "Daily", Payment: "$1,450.00", Funder: "Limitless Advance", Syndication: "5%", Commission: "$2,100.00", Status: "" },
    { Date: "6/17/2026", "Business Name": "Rescue MD PLLC", Name: "Tochi Okoro", Number: "(313) 649-1867", Email: "tochiokoro@myrescuemd.com", Amount: "$25,000.00", Rate: "1.3", Term: "20", "Term Unit": "Weeks", Payment: "$1,625.00", Funder: "ENOD via Yashard", Syndication: "0%", Commission: "$750.00", Status: "" },
  ].map((row, index) => normalizeFundedRow(row, "seed", index));

  // ── Pipeline deals — 2025 (Ethan's Deals - 2025.csv) ────────────────────
  const pipeline2025: PipelineDeal[] = [
    pp("11/25/2025","Timothy Roberts","TA Roberts Flooring LLC","Savannah, GA","(912) 963-8101","drewroberts1616@gmail.com","25-40k","Declined","Poor Daily Balances","10/20"),
    pp("11/28/2025","Joe Fusco","South American Sales LLC","Miami, FL","(201) 914-3248","JFusco.sas@gmail.com","3.2M","Offer from BFG","Wants to reach out in January","10/20"),
    pp("12/1/2025","Harry Sendzischew","Harry Sendzischew M.D.P.A.","Aventura, FL","(305) 409-8462","vesseldr@aol.com","50k","Over Leveraged NOW","Wants long term","10/20"),
    pp("12/1/2025","Adam Hegland","Hegland Custom Construction Inc","Cannon Falls, MN","(507) 403-3923","hegs9000@gmail.com","150k LOC or 80k Term","Declined","Proposed 10k, did not accept","10/20"),
    pp("12/2/2025","Omar Guerrero","OGL Sawing","Garland, TX","(469) 684-8431","oglsawing1@yahoo.com","20k","Declined","","10/20"),
    pp("12/3/2025","Pamela Castello","Pam Castello Relator","Tiki, TX","(281) 380-3808","pamcastello@comiskeyrealty.com","45k","Declined","Low Revenue","10/20"),
    pp("12/3/2025","Matthew Taggart","MTW Construction LLC","Vermillion, SD","(605) 670-2640","taggart_29@yahoo.com","10k","Declined","ZLUR","10/20"),
    pp("12/3/2025","Jesus Vasquez","JnJ Heating and Air","Abilene, TX","(469) 879-3978","jnjvas@gmail.com","50-100k","Declined","Default in April","10/28"),
    pp("12/4/2025","Errol Goffe","EKG Hauling INC","Jacksonville, FL","(754) 264-9437","ekghauling@comcast.net","30k","Offer from BFG","","10/20"),
    pp("12/4/2025","Cassidy Fontaine","Coopertail Grooming Co LLC","Lakeland, FL","(863) 944-9008","coppertailgrooming@gmail.com","15k","Declined","1 Default Jan 2024 paid off","10/20"),
    pp("12/5/2025","Chad Hart","South Padre Island Trips LLC","South Padre Island, TX","(512) 825-2157","chad@southpadretrips.com","50k","Sus Bruh","Never sent statements","12/4 AP"),
    pp("12/5/2025","Samantha Taylor","Taylor Transformation LLC","Weeki Wachee, FL","(813) 848-4232","samanthataylor777@gmail.com","25k","Declined","inconsistent Rev","12/4 HR"),
    pp("12/8/2025","Alec Vasquez","Kingdom Construction USA","Converse, TX","(210) 596-0881","avasquez@kingdom-usa.com","Anything","Declined","Defaulted on us before","6/23"),
    pp("12/8/2025","Juan Lopez","Up Top Holdings LLC","Miami, FL","(305) 440-6630","jlopez1139@yahoo.com","1M","Offer from BFG","Offered a deal but not taking","10/28"),
    pp("12/9/2025","Michael Anderson","Renovation Flooring LLC","Santa Rosa Beach, FL","(850) 624-7493","mike@renovationflooring.com","150k","Pending Contract Signature","Gone ghost","12/4 HR"),
    pp("12/10/2025","Alan Haile","Haile Enterprises INC","Greenbelt, MD","(301) 910-2187","haileenterprises@mail.com","25k","Declined","Default and low rev","10/20"),
    pp("12/15/2025","Anil Mahase","Synchronized Strategies LLC","Jackson, NJ","(908) 415-0665","mahaseanil@gmail.com","300k","FUNDED LIMITLESS","Funded 60k 45 days","12/4 AP"),
    pp("12/17/2025","Gervais Djomadji","Gervais D Limo LLC","Bronx, NY","(347) 772-7851","gervaismadji@yahoo.com","90k","Over Leveraged NOW","Has 3 positions that fall off in feb","12/4 AP"),
    pp("12/17/2025","Joel Weisberg","Great Shapes of Albertson","Roslyn, NY","(516) 840-4781","joel@shopgreatshapes.com","100k LOC","Offer from BFG","Wanted to consolidate","12/4 HR"),
    pp("12/18/2025","David Zambrzycki","Specialty Staffing Solutions LLC","Cedar Park, TX","(512) 796-0331","davidz_ssl@att.net","50k","Unfundable","Has positions/ Texas",""),
    pp("12/18/2025","Robert Dunbar","Dunbar Associates LLC","Monroe, CT","(917) 805-3129","dunbarassociatesllc@outlook.com","200k","Pending Contract Signature","Has positions, reach back out in a little",""),
    pp("12/19/2025","Ronald Larabee","Larabee Builder LLC","Ottawa, IL","(815) 257-3921","ron_lar_54@yahoo.com","20k","Declined","Low Rev",""),
    pp("12/19/2025","Raynald Desameau","Desameau & Okons PLLC","Salisbury, NC","(912) 332-3932","desameau88@gmail.com","150k","Pending Contract Signature","Has 2 positions (IOU & Kalamata 18mo)",""),
    pp("12/22/2025","Javier Salazar","Salazar Construction LLC","Gresham, OR","(503) 752-3186","salazarllc752@gmail.com","25k","Declined","Received offer from Woodmere",""),
    pp("12/22/2025","Tom Mbori","TBM Ambulance Services Corp","Chadds Ford, PA","(609) 972-1402","tbmhealthservicesllc2019@gmail.com","50k","Declined","Defaulted in 2023 but has ZBL","10/28"),
    pp("12/23/2025","Beshoui Botros","Saint Anthony LLC","Hilliard, OH","(614) 209-7882","bisho_maher2009@yahoo.com","20k","Pending Review","Has a million positions but by 1/22/26 all fall off",""),
    pp("12/23/2025","Bradley Homes","Watchmen Maintenance and Services","Somonauk, IL","(630) 956-1342","brad@watchmenmaintenance.com","30k","Declined","Expansion 7k balance, suing Spartan",""),
    pp("12/29/2025","Sean Holmes","Larco Construction LLC","Weslake, CA","(254) 412-8055","larcoconstruction@gmail.com","20k","Being Shopped","Defaulted but got ZBLs, makes money",""),
    pp("12/30/2025","Karl Bullard","The Rock Construction and Masonry","Oklahoma City, OK","(405) 308-9354","karl.bullard1@gmail.com","550k","Pending Review","Has 4 positions on a consolidation","10/28"),
    pp("12/31/2025","Michael Sirpilla","Society Brands","Massillon, OH","(330) 353-4385","michael@societybrands.com","150k","Unfundable","Amex account",""),
    pp("12/31/2025","Steve Hodge","Steve Hodge Building & Development LLC","Newton, AL","(334) 685-2479","customhomesbysteve@gmail.com","60-100k","Declined","Not good balances & low rev",""),
  ];

  // ── Pipeline deals — Jan 2026 ────────────────────────────────────────────
  const pipelineJan26: PipelineDeal[] = [
    pp("1/5/2026","Andrei Haurylik","Buildman Projects LLC","Trevose, PA","(786) 873-1180","ahaurylik@yahoo.com","60k","Declined","Blocked for a payments. Settled on later payment","12/4 AP"),
    pp("1/6/2026","Peter Reynolds","Coastal Landscaping","Charlestown, RI","(401) 808-0609","reynoldsp01@yahoo.com","10k","Declined","",""),
    pp("1/6/2026","Joe Cuevas","D&J Auto Repairs Services Corp","Winter Park, FL","(407) 844-0858","cuevasjoe097@gmail.com","7k","Pending Review","Have not sent statements",""),
    pp("1/7/2026","Jeffry Sosna","Jack Charles LLC","Loveland, OH","(513) 430-2903","jeff.sosna@gmail.com","100k","Offer from BFG","$30k 14 weeks; DNT",""),
    pp("1/7/2026","Gary Otten","AG Brokers Inc","Commack, NY","(631) 828-0007","agbrokers@yahoo.com","15k","Declined","DEFAULTED",""),
    pp("1/9/2026","Benjamin Slater","Benjamin B. Slater","Philadelphia, PA","(215) 834-3602","bslater@ap-schools.org","75k","KILLED AT FINAL","75K 30wks (KaF) Alo","7/30"),
    pp("1/9/2026","Rhonda Long","Changing Hearts Home Care LLC","Indianapolis, IN","(317) 956-2864","rlong@hlhomecare.com","150k","DID NOT SUBMIT","Negative Daily balances","6/23"),
    pp("1/12/2026","Michelle Lee","Kairo Services LLC","Leawood, KS","(913) 909-4777","kairosservicellc@gmail.com","40k","Declined","",""),
    pp("1/13/2026","Svetlana Lawlor","Can-Am Builders Inc","Matthews, NC","(980) 213-6181","svlawlor@gmail.com","50k","DID NOT SUBMIT","Too much nonsense with bank accounts",""),
    pp("1/15/2026","Rajesh Kumar","ICT Carrier/ Haven Carrier","Merced, CA","(209) 230-6259","rajesh2022ror11@gmail.com","","Sus Bruh","",""),
    pp("1/15/2026","James Hoover","Puroclean of Broken Arrow","Broken Arrow, OK","(918) 574-1484","jhoover@puroclean.com","400k","Offer from BFG","75k 1.30 44 weeks","10/28"),
    pp("1/15/2026","Kyle Adams","KD Electric LLC","Spokane, WA","(509) 904-6927","kylethomasada17@gmail.com","300k","Being Shopped","Did not answer me back",""),
    pp("1/16/2026","Daisy Gonzalez","Home Unlimited Real Estate Corp","Orlando, FL","(407) 575-8750","hu.madesimple@gmail.com","50k","DID NOT SUBMIT","Low deposits",""),
    pp("1/19/2026","Maria Herrera","Tacos Jalisco Cantina & Grill LLC","Reno, NV","(530) 386-0511","tj.jaliscocantina@gmail.com","100k","Offer from BFG","200k 18 mo Can Capital",""),
    pp("1/20/2026","Michael Clements","Idiom Brewing Company LLC","Frederick, MD","(202) 445-7332","mike@idiombrewing.com","80k","Declined","Lowered and no posted payment",""),
    pp("1/20/2026","Gregory Yeley","Dragonfly Lawn & Tree Care","Wichita, KS","(316) 518-5064","gyeley707@gmail.com","600k","Declined","Lowered Payments",""),
    pp("1/20/2026","Nigel Mills","Nigel Mills LLC","Vancleave, MS","(228) 257-0060","nigelmills16@gmail.com","40k","Declined","Received VADER 10k, has some negative days",""),
    pp("1/20/2026","Richard Showman","Blue Line Lawns and Landscaping","Dublin, VA","(540) 641-1215","bluelinelandscapes81@gmail.com","10k","Being Shopped","Try Woodmere; GOT FUNDED",""),
    pp("1/20/2026","Tanvir Bukht","Elanza Technologies","Chicago, IL","(312) 450-3311","info@elanzatech.com","150k","Declined","Low deposits",""),
    pp("1/21/2026","Cory Briscoe","CW Briscoe & Associates LLC","Baton Rouge, LA","(225) 773-1919","associates.briscoe.construction@gmail.com","100k","Declined","Default",""),
    pp("1/21/2026","Julio Angel Esquijarosa","Jae Montana Transport LLC","Pecos, TX","(346) 661-4215","jarmontana22@yahoo.com","100k","DID NOT SUBMIT","Negative balances & Texas",""),
    pp("1/21/2026","Jong Kim","HDBKJH CORP","Cerritos, CA","(213) 831-0614","kjong4447@gmail.com","350k","Declined","Defaults, debt consolidation, neg balances",""),
    pp("1/22/2026","James Cullop","Ace Home Services LLC","Roanoke, VA","(540) 293-6622","info@theacecrew.com","30k","DID NOT SUBMIT","No offers",""),
    pp("1/23/2026","William Stogner","Stogner Insurance LLC","Dallas, TX","(214) 535-3265","greta@stognerinsurance.com","250k","Offer from BFG","Working on SBA Term Loan",""),
    pp("1/23/2026","Tan Uckan","Medi Bites LLC","Fuquy Varina, NC","(919) 244-9878","tanuckan@nilsmc.com","75k","Offer from BFG","75k 13.5mo; NA",""),
    pp("1/26/2026","Joan Pouparina","7009 Wall Triana LLC","Miami Beach, FL","(305) 587-5793","joan@madisonproperties.org","150k","Offer from BFG","90k 12mo; NA",""),
    pp("1/26/2026","Alan Garcia","Grandeur Exteriors","New Braunfels, TX","(830) 369-9957","aogcasas2025@gmail.com","120k","Declined","No Offers",""),
    pp("1/26/2026","Jeff Wybrant","J2 Electric","Spanish Fork, UT","(385) 505-9085","jeff@j2electric.com","500k","Offer from BFG","20k 15 weeks flex; DNT",""),
    pp("1/27/2026","Mike Schultz","Schultz Contractors LLC","Milton, WA","(253) 922-8485","schultz.contractors@gmail.com","350k","Declined","Great balances but 2 defaults",""),
    pp("1/28/2026","Kip Foster","Bayview Stair Co","Panama City Beach, FL","(770) 862-4127","kipfoster69@gmail.com","40k","Offer from BFG","7600 144 days; DNT",""),
    pp("1/28/2026","John Frerich","Colorado River Aggregates LLC","Bronte, TX","(325) 718-7585","john.frerich@yahoo.com","160k","Pending Review","Perhaps SBA Term",""),
    pp("1/30/2026","Roland Stanley","PCL Restaurant Group INC","Gainesville, GA","(404) 683-9616","rolandstanley@pm.me","100k","Offer from BFG","45k 12 months",""),
    pp("1/30/2026","Tammy Johnson","For The Future LLC","Forest Hill, MD","(443) 643-7046","tjohnson@fishwindowcleaning.com","30k","Declined","Reverses & stacked OTA",""),
  ];

  // ── Pipeline deals — Feb 2026 ────────────────────────────────────────────
  const pipelineFeb26: PipelineDeal[] = [
    pp("2/2/2026","Delia Diaconu","Mansions Catering INC","NY, NY","(516) 233-8170","lelaislela@yahoo.com","350k","Offer from BFG","40k 90 days; DNT","113P1"),
    pp("2/2/2026","Michael Hilterbrand","Feed Barn Costa Mesa","Costa Mesa, CA","(949) 610-5457","info@feedbarncostamesa.com","200k","FUNDED","30k 18 weeks",""),
    pp("2/3/2026","Anas Alwedyan","JJ & As LLC","Houston, TX","(832) 518-7292","anaswedyan@yahoo.com","50k","Being Shopped","Nothing",""),
    pp("2/3/2026","Michael Grabow","Brentwood Limousine Inc","Macomb, MI","(586) 453-6952","mgrabow@brentwood-det.com","200k","Sus Bruh","Alleged Default",""),
    pp("2/3/2026","Patrick Mayer","South Eastex Sports Vehicle Sales","Lumberton, TX","(409) 454-1623","patdmayer@outlook.com","175k LOC","Submitted","Unrealistic desires",""),
    pp("2/4/2026","Jeff Allen","QuantumLeap Technology","Carson, CA","(424) 521-1500","info@qleaptech.com","100k","BLACKLISTED","FRAUD; MULTIPLE EIN & SSN",""),
    pp("2/4/2026","Tiffany Hogan","H&R Home Health Care LLC","Indianapolis, IN","(317) 992-3236","","70k","FUNDED","",""),
    pp("2/4/2026","Richard Sievert","Royal Carriage Limousine LLC","Palatine, IL","(224) 318-6754","royalcarriagelimollc@gmail.com","300k","Submitted","Has to end reversal",""),
    pp("2/5/2026","Offir Gabay","Go Air Inc","North Hollywood, CA","(818) 877-8770","manager@goairinc.com","50k","Pending Review","",""),
    pp("2/5/2026","Thomas Grubb","True Colors Custom Auto","York, PA","(410) 404-2015","truecolorsinc@comcast.net","20k","Submitted","",""),
    pp("2/6/2026","Randy Chelf","High Plains Insurance LLC","Enid, OK","(580) 548-4442","randy@chelfinsurance.com","250k","Submitted","No offers",""),
    pp("2/9/2026","Alexis Moller","Making 3 Cents","Dubuque, IA","(563) 845-6500","make3centsdbq@gmail.com","20k","DID NOT SUBMIT","Perhaps HELOC",""),
    pp("2/9/2026","Ashley Appleton","Cognicare Psychological Services","Branchburg, NJ","(347) 853-2046","ashleyappleton4@gmail.com","200k","Pending Review","Perhaps reverse worthy",""),
    pp("2/10/2026","Chance Crouch","Barefoot Park SPI LLC","South Padre, TX","(956) 533-8051","chance21barefootpark@gmail.com","15k","DID NOT SUBMIT","Low balances",""),
    pp("2/11/2026","Anthony Desmoni","Royalty Plumbing LLC","Las Vegas, NV","(702) 278-7354","admin@royaltyplumbingllc.com","200k","Limitless Offer","50-75k flex working on Term Loan",""),
    pp("2/11/2026","Camelia Bennani","Camelia Aesthetics","Irvine, CA","(949) 449-4096","camelia@biologimd.com","200k","Offer from BFG","205k 12 months forward",""),
    pp("2/12/2026","Jeff Cisneros","Sparta Sports and Entertainment","Thorton, CO","(303) 868-9561","jeff@spartamg.com","75k","Being Shopped","Just got funded 1/6/26",""),
    pp("2/12/2026","Scott Shelby","Selby Enterprises INC","Glendale, WI","(414) 349-0349","scott@acmesystems.net","400k","Declined","Reversals, stacked, negative balances",""),
    pp("2/12/2026","Jeremy Owens","JI5 Consulting & Management","Anaheim, CA","(714) 470-2203","jeremy@jl5inc.com","10k","Declined","",""),
    pp("2/12/2026","Ken Mohammed","Alpha Limo & Taxi INC","Hanover Park, IL","(847) 262-7156","alphalimotaxi@gmail.com","35k","Declined","",""),
    pp("2/13/2026","James Steil","Arrow Fleet Service","Streamwood, IL","(847) 322-2019","info@arrowfleetservices.com","250-300k","Submitted","",""),
    pp("2/16/2026","Angel Saad","Saad Remodeling & Custom Home Builders","Hialeh, FL","(305) 807-5743","saadremodeling@gmail.com","150k","Submitted","",""),
    pp("2/17/2026","Roy Sibaja","Property Evolution LLC","Morrisville, PA","(215) 478-3390","propertyevolutionllc@gmail.com","100k","Declined","Declining rev; reach out in a month",""),
    pp("2/17/2026","Joshua Leighton","Fleet Clean USA","Goffstown, NH","(603) 867-0202","josh.leighton@fleetcleanusa.com","50k","Declined","Declining rev; reach out in a month",""),
    pp("2/17/2026","William Smith","Georgia Home Roofing LLC","Cumming, GA","(678) 670-4786","brant@georgiahomeroofing.com","75-100k","Offer from BFG","25k 20 weeks",""),
    pp("2/19/2026","Joseph Johns","JBJ Lighting Services","Palmetto, FL","(941) 667-0585","brianjohns@gmail.com","30k","Submitted","35k 30wks",""),
    pp("2/19/2026","Gene Calumpong","Lexari Doors","Buena Park, CA","(714) 381-2167","lexaridoors@gmail.com","25k","Submitted","",""),
    pp("2/27/2026","Jonathan Wilcox","Pide Transport LLC","Concord, NC","(315) 489-3783","gitrdone2010@hotmail.com","50k","Sus Bruh","",""),
    pp("2/27/2026","Robert Underwood","Pele Freight LLC","Garland, TX","(214) 620-6235","underwoodgroup@gmail.com","350k","Submitted","30k 20wks",""),
  ];

  // ── Pipeline deals — Mar 2026 ────────────────────────────────────────────
  const pipelineMar26: PipelineDeal[] = [
    pp("3/2/2026","Adelina Warffeli","Whip-Co Trucking LLC","Lamar, NE","(904) 930-1496","info@whipcotruckingllc.com","50k","Offer from BFG","144k",""),
    pp("3/4/2026","David Flanigan","Flanigan's Furniture Outlet LLC","Casper, WY","(307) 797-4091","daveflanigan@gmail.com","40k","Submitted","Double owner. Stacked and default",""),
    pp("3/5/2026","Sameer Ailawadi","SV Donuts One LLC","Takoma Park, MD","(908) 917-8747","sa@ailhospitality.com","400k","Offer from BFG","150k 12 mo | 400k 40weeks",""),
    pp("3/5/2026","Jeff Carnay","Alibi Tavern","Springfield, OR","(541) 653-4742","jeffcarnay@comcast.net","40k","Submitted","Woodmere declined. Low balances",""),
    pp("3/5/2026","William Colfer","Colfer Custom Woodworking","Howell, NJ","(732) 580-9143","colfercustomwoodworking2001@gmail.com","150k","DID NOT SUBMIT","AWAITING STATEMENTS",""),
    pp("3/9/2026","Pierre Fransua","Christian Bros LLC","Thornton, CO","(720) 227-6575","christianbros2023@gmail.com","250k","BLACKLISTED","SUS; ALTERED STATEMENTS",""),
    pp("3/9/2026","Manuel Rodriguez","Rodriguez Construction LLC","Denver, CO","(720) 434-6029","manny@rdzbuild.com","150k","Being Shopped","Bitty offered 75k via other broker",""),
    pp("3/10/2026","Tochi Okoro","Rescue MD","Allen, TX","(313) 649-1867","tochiokoro@myrescuemd.com","50k","Offer from BFG","",""),
    pp("3/10/2026","Brooke Cardwell","Rolling Blue Logistics LLC","Herman, MN","(218) 770-9342","brooke@rollingbluelogisticsllc.com","175k","Submitted","Nothing. Wants reverse",""),
    pp("3/11/2026","Rahan Alrashdan","Maha Wholesale LLC","Cuyahoga Falls, OH","(330) 353-2195","mahawholesalellc@gmail.com","60k","DID NOT SUBMIT","Low monthly deposits",""),
    pp("3/11/2026","Phillips Matthew","Vessel Managers International LLC","Houston, TX","(832) 339-6843","ph@vesselmanagers.com","300k","Submitted","",""),
    pp("3/11/2026","Thomas Melesky","Melesky Enterprises INC","Dallas, TX","(817) 371-7782","tom@pressboxgrill.com","25k","Submitted","Funded by RAPID",""),
    pp("3/16/2026","Robert Ellis","Gemini Framing","Cambria, CA","(805) 431-0758","geminiframing@thegrid.net","65k","Submitted","",""),
    pp("3/16/2026","Ana Rodriguez","Rodriguez Services LLC","Phoenix, AZ","(928) 600-3654","rodriguezservicesllc.az@gmail.com","10k","DID NOT SUBMIT","Low Rev",""),
    pp("3/16/2026","Troy Brown","Brown Land Services","Centerville, TX","(903) 388-2755","troybbrown@windstream.net","800k","Being Shopped","",""),
    pp("3/17/2026","Ken Snitz","Snitz Corporation","Houston, TX","(918) 313-3000","kensnitz@hotmail.com","20k","DID NOT SUBMIT","Low Rev",""),
    pp("3/18/2026","David Rose","Dickinson Feed & Supply LLC","Dickinson, TX","(713) 726-6021","dickinsonfeed@aol.com","100k","Submitted","Default, lowered payments",""),
    pp("3/18/2026","Robert Nelson","Muscle Men Movers LLC","Temple Hills, MD","(301) 996-1091","info@musclemenmoversllc.com","75k","DID NOT SUBMIT","Low Rev",""),
    pp("3/18/2026","Darleen Blakley-Henderson","Blitz Haus Roofing & Renovations","Sealy, TX","(903) 341-3160","dblitzroofing@gmail.com","75k","Submitted","",""),
    pp("3/19/2026","John Johnson","Dawny Jeans LLC","Belmont, NY","(585) 981-0015","jmj.baj.5@gmail.com","20k","DID NOT SUBMIT","Low Rev",""),
    pp("3/19/2026","Temeka Tucker","Hearts of Compassion Community Services INC","Carmel, IN","(317) 956-0909","temeka.tucker@heartsofcompassioninc.com","100k","Submitted","Declines across the board",""),
    pp("3/19/2026","James McDowell","FL Dental Travels LLC","Hutchinson Island, FL","(561) 262-4987","drjdmcdowell@aol.com","20k","Submitted","",""),
    pp("3/20/2026","Edward Hamilton","Conexco","Noblesville, IL","(219) 628-6164","ed@conexcoinc.com","500k","Offer from BFG","250k 18 weeks",""),
    pp("3/20/2026","Douglas Lilley","DEL Electric LLC","Chesapeake, VA","(757) 646-5765","delelectricllc@gmail.com","50k","Being Shopped","Low Rev",""),
    pp("3/21/2026","Denise Thompson","Atlantic Embroidery Company","William Grove, PA","(215) 514-2154","dftatlanticemb@hotmail.com","40k","Declined","Woodmere, Low Rev",""),
    pp("3/23/2026","Karen Veasey","KVS Non Emergency Transportation Services","Sacramento, CA","(916) 398-5850","kvs.nets@gmail.com","150k","Being Shopped","",""),
    pp("3/23/2026","Mike Biondi","Team Biondi LLC","Lake Ariel, PA","(570) 575-2250","mike@teambiondi.com","300k","Submitted","Default but got funded",""),
    pp("3/23/2026","Javier Lemus Cardona","Pimpa Logistics LLC","Plano, TX","(973) 445-2719","javilemus73@hotmail.com","50k","Submitted","",""),
    pp("3/24/2026","Robert Hooper","High Tolerance Entertainment LLC","Sacramento, CA","(530) 262-9566","hooperbobby21@gmail.com","100k","Submitted","Stacked",""),
    pp("3/25/2026","Joselito Guzman","Bamboo Grill Inc","Bergenfield, NJ","(201) 280-4335","joed0406@aol.com","70k","Submitted","Default",""),
    pp("3/26/2026","Mark Mick","Mick Enterprises Parent Company LLC","Louisville, KY","(502) 262-0503","mark.mick@waxcenter.com","400k","Submitted","Default",""),
    pp("3/27/2026","Fred Stewart","Vanport Escrow and Title","Portland, OR","(503) 289-4970","fred@vanportoregon.com","750k","DID NOT SUBMIT","Default",""),
    pp("3/30/2026","Dalvin Noland","Texas Auto Doctor","Houston, TX","(662) 242-5255","tx.auto.doctor@gmail.com","15k","Being Shopped","",""),
    pp("3/30/2026","Joe Genova Jr.","Gencon Consulting INC","Anaheim, CA","(714) 497-5345","joe.genova@genovas.com","75k","Pending Review","",""),
    pp("3/30/2026","Nicholas Poolman","Horizon Home and Farm Improvement","Milford, IA","(712) 331-1906","horizoniowa@gmail.com","500k","BLACKLISTED","Scammer",""),
    pp("3/31/2026","Avinash Mehta","SSRP LLC","Laguna Niguel, CA","(949) 922-6846","amehta@ssrpllc.com","30k","Submitted","",""),
    pp("3/31/2026","Omega Allen","The Goodly Group of North Florida INC","Northeast, FL","(904) 465-4660","team@goodlygroup.com","150k","Being Shopped","",""),
    pp("3/31/2026","Alexis Rajah","IronCrest Trucking LLC","Torrington, CT","(475) 544-6082","info@ironcresttrucking.com","30k","DID NOT SUBMIT","Low Rev",""),
  ];

  // ── Pipeline deals — Apr 2026 ────────────────────────────────────────────
  const pipelineApr26: PipelineDeal[] = [
    pp("4/1/2026","Panjini Sivanna","Valley Medical Clinic PC","Fargo, ND","(701) 388-9299","sivannap@msn.com","100k","Submitted","","3/19"),
    pp("4/1/2026","Curt Gibbs","South Cumberland Insurance and Financial LLC","Tracy City, TN","(931) 273-0123","curt@southcumberlandinsurance.com","15k","DID NOT SUBMIT","Low Rev","3/19"),
    pp("4/1/2026","John Rickman","Sublimity Eyecare","Sublimity, OR","(503) 881-1833","jrickman@wvi.com","100k","Pending Review","Need stmts","2/4"),
    pp("4/13/2026","Preston Smith","New Beginnings Recovery","Talladega, AL","(256) 267-9655","psmith0508@aol.com","80k","Being Shopped","","10/20"),
    pp("4/13/2026","Diana Fregapane","All Right Flagging LLC","Las Vegas, NV","(702) 416-4349","showgizmo89030@gmail.com","50k","Pending Review","Need stmts","BD"),
    pp("4/14/2026","Joel Ortiz","Ortiz Stfg Corp","Richmond, TX","(913) 915-9633","joel@ortizstaffing.com","800k","Being Shopped","Reverse","2/4"),
    pp("4/15/2026","Vu Huynh","KJ Construction & Designs INC","Anaheim, CA","(714) 330-4685","vhuynh0790@gmail.com","25k","Declined","Default","1/13"),
    pp("4/15/2026","Devora Sandel","Neiman Wholesale Distributors INC","Bloomingburg, NY","(845) 263-2992","devorasandel@gmail.com","1M","Offer from BFG","200k offer","1/13"),
    pp("4/16/2026","Leonard Hill","April L Page (Thee Burger Spot)","Tampa, FL","(813) 770-3396","elccamino187@gmail.com","120k","Pending Review","","4/14"),
    pp("4/16/2026","William Pipes","Titan Ventures Inc","Sandy, UT","(714) 981-8622","coachbpipes@gmail.com","270k","Pending Review","",""),
    pp("4/17/2026","Zachary Crisp","Epicenter Productions LLC","Bedford, TX","(214) 632-4944","zach@epicenterproductions.net","350k","Submitted","","4/14"),
    pp("4/20/2026","Susan Novotny","Paisley Acres Farm","Aiken, SC","(803) 522-4516","paisleyacresfarm@gmail.com","15k","DID NOT SUBMIT","Low rev",""),
    pp("4/21/2026","Joseph Radel","Joe Radel Farms","Burnside, IL","(217) 357-5684","radel21@hotmail.com","180k","Being Shopped","","4/14"),
    pp("4/21/2026","Scott Gordon","SG Specialty Consulting LLC","Ronkonkoma, NY","(718) 619-0636","sgspecialtyconsultingllc@gmail.com","150k","Pending Review","Default","4/14"),
    pp("4/21/2026","Ahmad Quqa","Crescent Private Wealth LLC","Cary, NC","(919) 525-7175","ahmadquqa@gmail.com","1M","Submitted","","4/14"),
    pp("4/21/2026","Brett Murner","Brett Murner LLC","Wellington, OH","(216) 408-9060","brett@murnerlaw.com","40k","Pending Review","","4/14"),
    pp("4/23/2026","Matthew Byrd","Boomer Homes","Pooler, GA","(912) 704-6400","mattbyrd51@gmail.com","500k","Declined","Default",""),
    pp("4/28/2026","Karthik Ranganathan","RemoteBetter LLC","Fort Worth, TX","(214) 906-7807","info@remotebetter.ai","200k","Pending Contract Signature","",""),
    pp("4/28/2026","Karthik Ranganathan","Derma Beauty and Spa Medical Clinic","Fort Worth, TX","(214) 906-7807","info@remotebetter.ai","40k","Offer from BFG","34k and 10k LOC",""),
    pp("4/29/2026","Melissa Duncan","Duncan LLC","Front Royal, VA","(540) 974-1399","shenandoahvalley.owner@mrelectric.com","30k","Offer from BFG","",""),
    pp("4/29/2026","Trisha Biasotti","Blue Lagune Therapy LLC","Shoal Landing, TX","(713) 376-1343","info@bluelagunetherapy.com","300k","Offer from BFG","HELOC & Offer",""),
    pp("4/29/2026","Erika Perez","Victoria's Castle Daycare INC","New Windsor, NY","(201) 681-2177","eperez@victoriascastledaycare.com","450k","Offer from BFG","HELOC",""),
  ];

  // ── Pipeline deals — May 2026 ────────────────────────────────────────────
  const pipelineMay26: PipelineDeal[] = [
    pp("5/1/2026","Andrew Ernest","Research Applied Technology Education & Service Inc","Edinburg, TX","(956) 540-9390","anernest@office.ratesresearch.org","250k","Submitted","","3/19"),
    pp("5/6/2026","Sean Smith","Iron Rod Digital Solutions","Las Vegas, NV","(916) 719-8324","sean@ironrod.biz","200k","Being Shopped","","6/23"),
    pp("5/11/2026","Dana Young-Askew","Connection Point Services LLC","Virginia Beach, VA","(757) 633-5220","dana.young-askew@connectionpointservicesva.com","35k","Declined","Default 4/26",""),
    pp("5/11/2026","John Peskie","JP & Son Construction LLC","Enola, PA","(717) 943-3000","dpeskie@comcast.net","200k","Submitted","Mad positions",""),
    pp("5/13/2026","James Langley","Farm2Home LLC","Cameron, MO","(281) 786-7050","csdllcservices@gmail.com","25k","Pending Review","",""),
    pp("5/15/2026","Nachiappan Periakaruppan","Chida and Company LLC","Pleasanton, CA","(510) 541-7265","chidaandco@gmail.com","265k","Submitted","",""),
    pp("5/15/2026","Kevin Cason","Cason Unlimited","Fredericksburg, VA","(540) 426-9333","kevin@pacificlasales.com","15k","Offer from BFG","10k 30days",""),
    pp("5/15/2026","Francis Muralidharan","Keystone Acquisitions LLC","Sheridan, WY","(818) 414-1231","fmuralid@gmail.com","6M","Pending Review","",""),
    pp("5/19/2026","Mario Parceiro","MJP Construction LLC","Fall River, MA","(774) 955-4392","mparceiro06@hotmail.com","40k","Pending Review","",""),
    pp("5/26/2026","Sandro Toledo","Sato Solution INC","Townsend, MA","(978) 259-3731","sato.solution23@gmail.com","100k","Being Shopped","40k 12 weeks",""),
    pp("5/26/2026","Jack Martin","Thats It Thats All Contracting LLC","Ocala, FL","(352) 299-5990","titacontracting@gmail.com","10k","Pending Review","",""),
    pp("5/27/2026","Joel Krieger","Krieger Real Estate LLC","New York, NY","(917) 647-8840","joel@kriegerre.com","145k","Pending Review","",""),
    pp("5/28/2026","Daniel Willey","Willey Way Contracting LLC","Adairsville, GA","(678) 767-1194","dtwilley077@gmail.com","100k","Pending Review","",""),
    pp("5/29/2026","Raul Vivar","9ERS Trucking LLC","San Elizario, TX","(915) 328-5786","rv9erstruckingllc@gmail.com","30k","Offer from BFG","",""),
    pp("5/29/2026","Wing Siu","Betsutenjin INC","Seattle, WA","(206) 849-2567","peter@lljinc.com","150k","Declined","Default",""),
  ];

  // ── Pipeline deals — Jun 2026 ────────────────────────────────────────────
  const pipelineJun26: PipelineDeal[] = [
    pp("6/3/2026","John Welsh","Welsh Hagen Associated","Reno, NV","(775) 853-7776","cidzinga@welshhagen.com","50k","Offer from BFG","12k 40 days",""),
    pp("6/3/2026","David Dahmer","Family Chiropractor Health Center","Brooksville, FL","(352) 232-1948","dkdahmer@gmail.com","100k","Being Shopped","Sus",""),
    pp("6/3/2026","Jayne Morehouse","Jayne & Company LLC","Strongsville, OH","(440) 840-1991","jayne@jayneandco.com","10k","Declined","Low Rev",""),
    pp("6/4/2026","Jerry Perkins","Integrated Solutions Worldwide","Orlando, FL","(407) 492-9370","jperkins@symbee.com","50k LOC","Being Shopped","Mercury Statements",""),
    pp("6/5/2026","Johnny Whaley","Sevierville Tire & Automotive","Sevierville, TN","(865) 256-5247","jlw23may@yahoo.com","100k","Declined","Default",""),
    pp("6/10/2026","Daniyal Feroz","Feroz Builders LLC","Phoenixville, PA","(484) 447-8664","daniyalferoz99@gmail.com","60k","Pending Review","Low Rev",""),
    pp("6/11/2026","Pitou Ngin","CNST Health Care","Fullerton, CA","(714) 343-8468","peter.ngin@brightstarcare.com","150k","Declined","Collections",""),
    pp("6/12/2026","Dennis Easter","Imagine Unlimited INC","Milton, GA","(678) 773-2454","dweaster@imagedoors.biz","350k","Declined","Low rev",""),
    pp("6/12/2026","Lynn Wills","ENGAGE Labs LLC","Greenwood Lake, NY","(845) 321-1928","lwills@engagelabsllc.com","25k","Submitted","",""),
    pp("6/15/2026","Vivek Sharma","Laumiere Gourmet Fruits","Bakersfield, CA","(661) 497-1161","vivek@laumieregourmet.com","80k","Declined","Default",""),
    pp("6/16/2026","Miguel Lainez","Metro Flooring CTRS","Columbia, MD","(703) 475-1336","lainezbravo@outlook.com","75k","Pending Review","Josh Exclu 7/15",""),
    pp("6/22/2026","Chris Maris","Chris Maris Custom Homes & Remodeling LLC","Little Rock, AR","(501) 837-3777","cbmaris@comcast.net","150k","Pending Review","Default",""),
    pp("6/23/2026","Pat Patton","Hunt Patton & Brazeal INC","Houston, TX","(303) 618-4875","knail@huntpatton.com","70k","Pending Review","Need Full May",""),
    pp("6/23/2026","John Hebner","Fulcrum Institute Dispute Resolution Clinic","Spokane, WA","(509) 868-6353","jhebner@fulcrumdispute.org","300k","Being Shopped","",""),
    pp("6/24/2026","Matthew James","Commercial Kitchen Solutions","Humble, TX","(281) 967-0306","mattjames@cks-texas.com","200k","Being Shopped","",""),
    pp("6/24/2026","Adedayo Adelanke-Saanumi","Pine Medical PLLC","Bellville, TX","(713) 480-6412","rex_dayo@yahoo.com","40k","Pending Review","",""),
    pp("6/24/2026","Peter Norton","Pact Consultants","Yorba Linda, CA","(714) 406-8209","peternorroo@gmail.com","500k","Pending Review","",""),
  ];

  const pipelineDeals: PipelineDeal[] = [
    ...pipeline2025,
    ...pipelineJan26,
    ...pipelineFeb26,
    ...pipelineMar26,
    ...pipelineApr26,
    ...pipelineMay26,
    ...pipelineJun26,
  ];

  // ── Follow-Ups / Contacts (Contacted Leads - Sheet1.csv) ─────────────────
  let _fIdx = 0;
  const fu = (n: string, ph: string, em: string, b: string, r: string, nt: string, mo: string, pos: string, app: string, lc: string, sh: string): FollowUpItem =>
    normalizeFollowUpRow({ "Full name": n, Number: ph, Email: em, "Business Name": b, Request: r, Notes: nt, Monthly: mo, Positions: pos, App: app, "Date Last Contacted": lc, Sheet: sh }, "seed", _fIdx++);

  const followUps: FollowUpItem[] = [
    fu("Gilbert Reynosa","(210) 336-4507","reynosa.refrigeration@gmail.com","","50k","Texas","","","FALSE","Ent 1/13/26","6/23"),
    fu("Lowell Dixon","(816) 291-2004","lowell.dixon@dellplaster.com","","80k","Burned bridges, passed to Josh","","","FALSE","","12/4 HR"),
    fu("David James","(314) 401-0793","coflaherty@onebox.com","","","Reach back out january","","","FALSE","","12/4 HR"),
    fu("Yen Tren","(619) 300-7476","yen@quantumsportscards.com","Quantum Sports Card","","","","","FALSE","","5/21"),
    fu("Gustavo","(954) 708-3482","deep954@ymail.com","","","Needs better monthly rev","","","FALSE","","6/23"),
    fu("Samantha Taylor","(813) 848-4232","samanthataylor777@gmail.com","","25k","Needs better monthly rev","","","TRUE","","12/4 HR"),
    fu("Bradley Wait","(630) 956-1342","brad@watchmenmaintenance.com","","","","","","FALSE","","10/20"),
    fu("Alfredo","(916) 230-8943","","","20k","","","","FALSE","","10/20"),
    fu("Pamela Castello","(281) 380-3808","pamcastello@comiskeyrealty.com","","45k","Needs better monthly","","","TRUE","","10/20"),
    fu("Paul Smerud","(812) 219-3812","paulsmerud@gmail.com","The Spar Restaurant & Bar LLC","","","","","FALSE","C 1/2/26","12/4 HR"),
    fu("Annamaria","(321) 288-0156","","","","Check back in Q2","","","FALSE","1/2/2026","10/20"),
    fu("Jay Blackston","(817) 371-4517","","MACLNS Venture Group LLC","","TEXAS (Said check back in 6 months)","","","FALSE","12/2/2025","10/20"),
    fu("Karen Veasey","(916) 398-5850","kvs.nets@gmail.com","KVS Non-Emergency Transportation Services","150k","Said to reach out in january","","","FALSE","","5/21"),
    fu("Steven Boxely","(518) 365-8843","steve@boxleys.com","Boxley's Services Inc.","150k","","","","FALSE","","10/20"),
    fu("Paul Martin","(516) 448-1940","kingsandqueens1255@gmail.com","","","Term Loan","","","FALSE","C 1/2/26","7/30"),
    fu("Rick Long","(442) 219-6850","armydocl1974@outlook.com","Warm Hearts Home Care Agency LLC","","","","","FALSE","CA 1/29/26","6/23"),
    fu("Joseph Melia","(805) 732-7971","joe@meliaindustriesinc.com","Melia Industries","250k","Had positions and is looking for 12k/mo for 250k","","","FALSE","","12/4 HR"),
    fu("Lauren Rengucci","(401) 489-0130","laurenrengucci@yahoo.com","Captain Baker Donuts","","Got funded on 11/24. Calling to see if want consolidation","","","FALSE","","10/28"),
    fu("Jose Cuevas","(407) 844-0858","cuevasjoe097@gmail.com","D&J Auto Repairs Corp","7k","","","","FALSE","","10/20"),
    fu("Adam Hegland","(507) 403-3923","hegs9000@gmail.com","Hegland Custom Construction LLC","80k","Offered 10k did not take. Default this year","","","FALSE","","10/20"),
    fu("Matthew Agee","(602) 513-2867","ageebbq@gmx.com","","25k","","","","FALSE","","10/20"),
    fu("Timothy Garrettson","(772) 341-4575","","","","Selling business","","","FALSE","","10/20"),
    fu("Roman Rudy","(916) 912-0487","Roman Rudy","Rudys Metals","35k","Good for now","","","FALSE","","6/23"),
    fu("Dana Phillips","(317) 658-7738","dana.phillips29@gmail.com","","","","","","FALSE","","10/28"),
    fu("David Zambrzycki","(512) 796-0331","davidz_ssl@att.net","","25-30k","","","","FALSE","","10/20"),
    fu("Gervais Djomadji","(347) 772-7851","gervaismadji@yahoo.com","","90k","Has 40k left in positions that fall off in Feb","","","TRUE","","12/4 AP"),
    fu("David Lanter","(954) 557-0534","dlanter@yahoo.com","","","","","","FALSE","","10/20"),
    fu("Stephanie","(978) 852-1028","","","","Reach back out in January","","","FALSE","","10/20"),
    fu("Randel Henderson","(281) 914-5042","randelhenderson@gmail.com","","60k","Reach back out in February","","","FALSE","1/5/2026","12/4 HR"),
    fu("Joel Weisberg","(516) 840-4781","joel@shopgreatshapes.com","Great Shapes of Albertson","150k","ONDECK & RAPID. Offered 100k 1 year wont take","$83k","2","TRUE","12/22/2025","12/4 HR"),
    fu("Randy Johnson","(281) 770-5289","k.johnson@lmlawn.com","LM Lawn","","Reach back out in January","","","FALSE","1/5/2026",""),
    fu("David Zambrzycki","(512) 796-0331","davidz_ssl@att.net","Specialty Staffing Solutions LLC","50k","Expected $350k from westlake and $150k from IRS. TEXAS","","","TRUE","",""),
    fu("Robert Dunbar","(917) 805-3129","dunbarassociatesllc@outlook.com","Dunbar Associates LLC","120k","Just took some funding, reach back out in a couple of months","$120k","2","TRUE","",""),
    fu("Brian Salle","(828) 387-5000","briantsalle@gmail.com","","","Reach out April 3","","","FALSE","",""),
    fu("Ronald Larabee","(815) 257-3921","ron_lar_54@yahoo.com","Larabee Builders LLC","10-15k","Low Rev, reach back out in a couple months","","","FALSE","",""),
    fu("Michael","(314) 761-3831","ucitytees@yahoo.com","Ucity Tees","15-20k","","$35-$40k","0","FALSE","12/15/2025",""),
    fu("Anil Mahase","(908) 415-0665","mahaseanil@gmail.com","","150k","","400k","3","TRUE","12/16/2025",""),
    fu("Karl Bullard","(405) 308-9354","karl.bullard1@gmail.com","The Rock Construction and Masonry","550k","Has positions, paying 14k a week","","","FALSE","",""),
    fu("Sean Holmes","(254) 412-8055","larcoconstruction@gmail.com","Larco Construction","25k","","","","TRUE","1/9/2026",""),
    fu("Scott Sanders","(603) 465-8292","ssanders@hlg.com","Horticulture Lighting Group Corp","500k","","","","FALSE","",""),
    fu("Amin Abbasher","(817) 323-9353","","","","ZLUR","","","FALSE","",""),
    fu("Javier Salazar","(503) 752-3186","salazarllc752@gmail.com","Salazar Construction LLC","25-35k","No positions, no defaults. Took small deal from woodmere","$50-$100k","","TRUE","12/22/2025",""),
    fu("David Pratt","(503) 979-5379","dpratt@exteriorsfirst.com","Exteriors First","110k","Looking 110k payback 148k","","","FALSE","12/31/2025","12/4 HR"),
    fu("Beshoui Botros","(614) 209-7882","bisho_maher2009@yahoo.com","Saint Anthony LLC","20k","Has a million positions but by 1/22/26 all fall off","$100-$120k","5","TRUE","",""),
    fu("Robert Dunbar","(917) 805-3129","dunbarassociatesllc@outlook.com","Dunbar Associates LLC","200k","Offering 30k with flex potentially","120k+","2","TRUE","",""),
    fu("Raynald Desameau","(912) 332-3932","desameau88@gmail.com","Desameau & Okons PLLC","650k","Fumbled $150k deal","120k","2","TRUE","",""),
    fu("Sandro Leite","(203) 241-7251","","BROOKLYN PET SPA INC","","Reach out in Q2","","","FALSE","","12/4 AP"),
    fu("Jimmy Rosales","(832) 584-5848","mbdmaintenance17@gmail.com","","50k","","","","FALSE","",""),
    fu("Eli Williams","(832) 647-7411","eli.c.williams@gmail.com","","30-40k","Check back in Feb/March. Trucks down","","","FALSE","","10/20"),
    fu("Alonzo Gibson","(757) 944-3917","gibsonsralonzo2@gmail.com","","70k","","","","FALSE","","12/29"),
    fu("Duane Cross","(805) 712-5805","teamcross@xfamilylegacy.com","","","SBA but now consolidation. Call back Jan 7","","","FALSE","CNA 1/13/26","12/29"),
    fu("Danny","(432) 634-4038","dctrks@gmail.com","","","Told to reach back after the New Year","","","FALSE","CNA 1/13/26","12/29"),
    fu("Tamene","(503) 704-8281","tamedebo@yahoo.com","","","","","","FALSE","C 1/6/26","12/29"),
    fu("Steven","(252) 624-6774","tohe007@gmail.com","","","Own independent label. Said to reach out in Q2","","","FALSE","","12/29"),
    fu("Steve","(334) 685-2479","customhomesbysteve@gmail.com","Steve Hodge Building & Development LLC","60k","230k in positions","","","TRUE","",""),
    fu("Timothy","(253) 224-0746","timothy@camseattle.org","","","","","","FALSE","",""),
    fu("Paul","(973) 907-6373","breezypaulb@gmail.com","","","Said to hold off until April","","","FALSE","ET 2/18/26",""),
    fu("Brandon","(267) 804-3311","","","","","","","FALSE","CNA 1/13/26","12/29"),
    fu("Andrew Chmielewski","(248) 462-2551","andrew@davessweettooth.com","","$300-500k","","","","FALSE","CNA 1/29/26",""),
    fu("Theodore Toby Ryan","(302) 377-9157","outdoordesigngroup2016@gmail.com","ODG LLC","","Reach out Q2","","","FALSE","C/A 1/6/26",""),
    fu("Rob","(631) 949-9205","dutchmons@gmail.com","Investment In Landscapes","70k","Possibly delayed to February","","","FALSE","C/A 1/6/26","12/29"),
    fu("Richard Bird","(716) 207-6074","gambleprint@verizon.net","","30k","","","","FALSE","C/A 1/6/26","6/23"),
    fu("Lyndel","(818) 424-6186","","","200k","Reach back in July","","","FALSE","C/A 1/13/26","12/29"),
    fu("Peter Reynolds","(401) 808-0609","reynoldsp01@yahoo.com","Coastal Landings","","","","","FALSE","",""),
    fu("Michael Davis","(706) 990-1265","usenergyproducts@yahoo.com","US Energy Products","300k","Wants 12-24mo","","","FALSE","",""),
    fu("Robert","(443) 553-1128","","tree cutting business","","Reach out in Q2","","","FALSE","",""),
    fu("William Cliftn","(618) 638-3610","cliftn30@yahoo.com","","600k","10yr term loan","","","FALSE","",""),
    fu("Silverio Reyes","(704) 919-6964","silverioreyes34@gmail.com","East And B","","","","","FALSE","",""),
    fu("Cecilia Guzman","(347) 744-2211","donpoli3143@gmail.com","Don Poli Meat Market Corp","","","","","FALSE","",""),
    fu("Benjamin Slater","(215) 834-3602","bslater@ap-schools.org","","75k","Killed at Final","","","TRUE","",""),
    fu("Rhonda Long","(317) 956-2864","rlong@hlhomecare.com","Changing Hearts Home Care LLC","150k","Bunch of defaults and nonsense. Killed but revisit later","","","TRUE","","6/23"),
    fu("Michelle Lee","(913) 909-4777","kairosservicellc@gmail.com","Michelle O'Connor Real Estate","40k","","","","TRUE","","6/23"),
    fu("Sotero Rivers","(310) 634-4468","graydoncorp@gmail.com","Graydon Corp Logistics","","","","","FALSE","","6/23"),
    fu("Tayler Davis","(480) 703-8050","","","","Selling farm. Reach out in Q2","","","FALSE","",""),
    fu("Svetlana Lawlor","(980) 213-6181","svlawlor@gmail.com","","5-10k","Had an off month, but could be good for more","fluctuates but typically 25k-50k","0","FALSE","","6/23"),
    fu("Coleman","(803) 960-8991","colemanparks@gmail.com","Coleman Construction","300k","","","","FALSE","",""),
    fu("Evan","(718) 924-9963","e.wimberly@yahoo.com","","","","","","FALSE","",""),
    fu("Michael Jensen","(815) 355-8765","","","","Wants me to reach out EOY but do so come summer","","","FALSE","",""),
    fu("Dean","(307) 751-5245","wdean9752@gmail.com","","","Looking for 1.5 million dollar LOC","","","FALSE","CNA 1/13/26","12/29"),
    fu("Bill","(478) 731-1236","rkent546@gmail.com","","","200k","20-25 verbally","","FALSE","CA 1/13/26","6/23"),
    fu("Milton Hernandez","(561) 502-4322","milton@scopexpro.com","","20k","","","","FALSE","CA 1/28/26","6/23"),
    fu("David Turner","(989) 387-5890","dturner169@gmail.com","","50k","","","","FALSE","CNA 2/3/26","6/23"),
    fu("Jeffrey","(551) 500-3866","","","","","","","FALSE","",""),
    fu("Joshua","(901) 825-8229","joshuajandt@hotmail.com","","","Reach back out in 4-6 months","","","FALSE","",""),
    fu("Amir","(214) 994-5748","jamaal938@yahoo.com","","","","","","FALSE","",""),
    fu("Richard Sievert","(224) 318-6754","royalcarriagelimollc@gmail.com","Royal Carriage Limousine LLC","300k","Needs to end reversal and pay off debt so we can come in","200k","4","TRUE","",""),
    fu("Chester","(334) 830-7521","","","","","","","FALSE","",""),
    fu("Francisco Reyes","(775) 813-7765","","","","","","","FALSE","",""),
    fu("Matthew Peterson","(619) 847-5601","","","","","","","FALSE","",""),
    fu("Chris Tweedy","(619) 846-8148","","","","","","","TRUE","",""),
    fu("Rakan Alrashdan","(330) 353-2195","mahawholesalellc@gmail.com","Maha Wholesale","300k","REACH OUT IN APRIL","25k","","TRUE","",""),
    fu("Dave Flanigan","(307) 797-4091","daveflanigan@gmail.com","Flanigan Furniture Outlet","150k","Reach out in a month","","","TRUE","3/12/26",""),
    fu("John Yingling","(414) 940-5630","yingling@execpc.com","Council for the Spanish Speaking","100k","","","","FALSE","3/12/26",""),
    fu("IDK","(317) 358-0027","beckandsonsods@outlook.com","Beckandsonsods","","Reach out in JUNE","","","FALSE","",""),
    fu("David Rose","(713) 726-6021","dickinsonfeed@aol.com","Dickinson Feed & Supply LLC","100k","Reach Out in July","40k","","TRUE","3/18/26",""),
    fu("Thomas Melesky","(817) 371-7782","tom@pressboxgrill.com","Melesky Enterprises (Press Box Grill)","25k","Took deal with Rapid. Reach out in few months","150k","","TRUE","3/18/26",""),
    fu("Oren Betesh","(267) 303-4985","","","","","","","FALSE","",""),
  ];

  // Fix commission amounts for deals where it's negative (CB)
  fundedDeals.forEach((deal) => {
    if (!deal.commissionAmount && deal.commissionAmount !== 0) {
      deal.commissionAmount = 0;
    }
  });

  const importBatches: ImportBatch[] = [
    { id: "import-funded-seed", filename: "Ethan Funded Deals - Sheet1.csv", importType: "funded", rowsImported: fundedDeals.length, rowsSkipped: 0, detectedColumns: ["Date","Business Name","Name","Amount","Rate","Term","Term Unit","Payment","Funder","Syndication","Commission","Status"], importedAt: new Date().toISOString() },
    { id: "import-pipeline-seed", filename: "Ethan's Deals - 2025 through Jun 26.csv", importType: "pipeline", rowsImported: pipelineDeals.length, rowsSkipped: 0, detectedColumns: ["Date App","Name","Business","City, State","Number","Email","Request","Status","Notes","Sheet"], importedAt: new Date().toISOString() },
    { id: "import-contacts-seed", filename: "Contacted Leads - Sheet1.csv", importType: "follow-up", rowsImported: followUps.length, rowsSkipped: 0, detectedColumns: ["Full name","Number","Email","Business Name","Request","Notes","Monthly","Positions","App","Date Last Contacted","Sheet"], importedAt: new Date().toISOString() },
  ];

  return { fundedDeals, pipelineDeals, followUps, importBatches, sourceMode: "csv" };
}

// ── Helper: build a PipelineDeal via normalization ───────────────────────────
let _pIdx = 0;
function pp(
  dateApp: string, name: string, business: string, cityState: string,
  phone: string, email: string, request: string, status: string,
  notes: string, sheet: string,
): PipelineDeal {
  return normalizePipelineRow(
    { "Date App": dateApp, Name: name, Business: business, "City, State": cityState, Number: phone, Email: email, Request: request, Status: status, Notes: notes, Sheet: sheet },
    "seed",
    _pIdx++,
  );
}
