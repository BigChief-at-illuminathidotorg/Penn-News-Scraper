// PENN NEWS MONITOR - SITE LIST
// Single source of truth for both the dashboard and scraper.
// Edit here to add/change sites and groups.
// Fields: id, name, parentUnit, bucket, subhead, newsUrl, magazineUrl, notes, posts
// Do NOT add a 'code' field - it has been removed.

window.PENN_MONITOR_DEFAULT_SITES = [
  {
    "id": "annenberg",
    "name": "Annenberg",
    "parentUnit": "Annenberg",
    "bucket": "School",
    "subhead": "Media, communications, public discourse",
    "newsUrl": "https://www.asc.upenn.edu/news-events/news",
    "magazineUrl": "https://www.asc.upenn.edu/news-events/connections-year-annenberg",
    "notes": "",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "dental",
    "name": "Dental",
    "parentUnit": "Dental",
    "bucket": "School",
    "subhead": "Oral health, clinics, biomedical discovery",
    "newsUrl": "https://www.dental.upenn.edu/news-events/recent-news/",
    "magazineUrl": "https://www.dental.upenn.edu/news-events/penn-dental-medicine-journal/",
    "notes": "",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "gse",
    "name": "GSE",
    "parentUnit": "GSE",
    "bucket": "School",
    "subhead": "Education research, teaching, policy",
    "newsUrl": "https://www.gse.upenn.edu/news-and-events/news",
    "magazineUrl": "https://publications.gse.upenn.edu/",
    "notes": "",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "law",
    "name": "Law",
    "parentUnit": "Law",
    "bucket": "School",
    "subhead": "Legal scholarship, policy, institutions",
    "newsUrl": "https://www.law.upenn.edu/newsevents/",
    "magazineUrl": "https://journal.law.upenn.edu/",
    "notes": "Confirmed 2026-08-04: this page is a curated 'Featured' homepage widget with NO date shown anywhere in the DOM for any item (LiveWhale CMS). date_optional is enabled in SITE_RULES so items still surface (using the scrape date as a stand-in), but there's no way to tell how old a given 'Featured' item actually is from this page alone.",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "medicine",
    "name": "Medicine",
    "parentUnit": "Medicine",
    "bucket": "School",
    "subhead": "Clinical research, translational science, care delivery",
    "newsUrl": "https://www.pennmedicine.org/news/search?hideFADListing=false&pageType=taxonomyTemplatePage&pageTypeId=97a5141a-e62c-4dde-8fc0-160f2571b56a&sort=created&sortOrder=DESC&page=1&resultsPerPage=10&pageContentType=*",
    "magazineUrl": "https://www.pennmedicine.org/news/penn-medicine-magazine",
    "notes": "",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "nursing",
    "name": "Nursing",
    "parentUnit": "Nursing",
    "bucket": "School",
    "subhead": "Care systems, public health, training, outcomes",
    "newsUrl": "https://www.nursing.upenn.edu/news-events/news-archives/",
    "magazineUrl": "https://www.nursing.upenn.edu/magazine/",
    "notes": "No dates shown on this page; the monitor keeps the 7 newest stories.",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "seas",
    "name": "SEAS",
    "parentUnit": "SEAS",
    "bucket": "School",
    "subhead": "Engineering, AI, robotics, materials, systems",
    "newsUrl": "https://www.engineering.upenn.edu/stories/",
    "magazineUrl": "https://magazine.seas.upenn.edu/",
    "notes": "URL fixed 2026-08-04: old engineering.upenn.edu/stories/ domain is dead/wrong, current site is www.seas.upenn.edu/stories/ (WordPress). Byline pattern is 'Category, Category / Month D, YYYY' as plain text, not a <time> element.",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "sp2",
    "name": "SP2",
    "parentUnit": "SP2",
    "bucket": "School",
    "subhead": "Social policy, social work, community research",
    "newsUrl": "https://sp2.upenn.edu/news/",
    "magazineUrl": null,
    "notes": "",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "vet",
    "name": "Vet",
    "parentUnit": "Vet",
    "bucket": "School",
    "subhead": "Animal health, veterinary medicine, translational work",
    "newsUrl": "https://www.vet.upenn.edu/all-news/?filter[article_type][]=penn-vet-news",
    "magazineUrl": "https://www.vet.upenn.edu/bellwether-magazine/",
    "notes": "2026-11-04: filtered Penn Vet News listing (the old page mixed in outside coverage).",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "wharton",
    "name": "Wharton",
    "parentUnit": "Wharton",
    "bucket": "School",
    "subhead": "Business, markets, management, decision-making",
    "newsUrl": "https://news.wharton.upenn.edu/feed/",
    "magazineUrl": "https://magazine.wharton.upenn.edu/",
    "notes": "WordPress RSS feed — much cleaner than scraping the newsroom HTML",
    "posts": [],
    "feedUrl": "https://news.wharton.upenn.edu/feed/"
  },
  {
    "id": "weitzman",
    "name": "Weitzman",
    "parentUnit": "Weitzman",
    "bucket": "School",
    "subhead": "Architecture, planning, preservation, design",
    "newsUrl": "https://www.design.upenn.edu/news",
    "magazineUrl": null,
    "notes": "URL fixed 2026-08-04: /news/press-releases now 404s. /news defaults to today's date filter. /weitzman-news is the real dated listing (confirmed via search) — dates there are US-style MM.DD.YYYY.",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "appc",
    "name": "APPC",
    "parentUnit": "Annenberg",
    "bucket": "Unit",
    "subhead": "Policy research and public opinion",
    "newsUrl": "https://www.annenbergpublicpolicycenter.org/appc-general-news/",
    "magazineUrl": null,
    "notes": "2026-11-04: APPC General News listing (the site-wide feed mixes in other posts).",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "knowledge-at-wharton",
    "name": "Knowledge at Wharton",
    "parentUnit": "Wharton",
    "bucket": "Unit",
    "subhead": "Business analysis, markets, management, ideas",
    "newsUrl": "https://knowledge.wharton.upenn.edu/articles/#t=All&sort=date%20descending",
    "magazineUrl": null,
    "notes": "2026-10-28: /feed/ returns HTTP 403 (WAF), so feed disabled; scraping the JS-rendered articles page instead.",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "sas-omnia",
    "name": "SAS - Omnia",
    "parentUnit": "SAS",
    "bucket": "Unit",
    "subhead": "Arts and sciences stories, essays, ideas",
    "newsUrl": "https://omnia.sas.upenn.edu/latest",
    "magazineUrl": null,
    "notes": "No dates shown on this page; the monitor keeps the 7 newest stories.",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "andrea-mitchell-center-for-the-study-of-democracy",
    "name": "Andrea Mitchell Center",
    "parentUnit": "SAS",
    "bucket": "Center",
    "subhead": "Democracy, politics, public discourse",
    "newsUrl": "https://amc.sas.upenn.edu/news",
    "magazineUrl": null,
    "notes": "SAS Drupal - JS-rendered",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "center-for-east-asian-studies",
    "name": "Center for East Asian Studies",
    "parentUnit": "SAS",
    "bucket": "Center",
    "subhead": "Penn communications source",
    "newsUrl": "https://ceas.sas.upenn.edu/news",
    "magazineUrl": null,
    "notes": "SAS Drupal - JS-rendered",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "center-for-study-of-contemporary-china",
    "name": "Center for Study of Contemporary China",
    "parentUnit": "SAS",
    "bucket": "Center",
    "subhead": "Penn communications source",
    "newsUrl": null,
    "magazineUrl": null,
    "notes": "No news URL found yet.",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "center-for-the-study-of-ethnicity-race-immigration",
    "name": "Center for Ethnicity, Race & Immigration",
    "parentUnit": "SAS",
    "bucket": "Center",
    "subhead": "Penn communications source",
    "newsUrl": "https://cseri.sas.upenn.edu/news",
    "magazineUrl": null,
    "notes": "SAS Drupal - JS-rendered",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "center-for-creative-writing",
    "name": "Center for Creative Writing",
    "parentUnit": "SAS",
    "bucket": "Center",
    "subhead": "Penn communications source",
    "newsUrl": "https://creative.writing.upenn.edu/news",
    "magazineUrl": null,
    "notes": "",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "kleinman-center-for-energy-policy",
    "name": "Kleinman Center for Energy Policy",
    "parentUnit": "Weitzman",
    "bucket": "Center",
    "subhead": "Energy policy research",
    "newsUrl": "https://kleinmanenergy.upenn.edu/about/news/",
    "magazineUrl": null,
    "notes": "",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "the-water-center",
    "name": "The Water Center",
    "parentUnit": "SAS",
    "bucket": "Center",
    "subhead": "Water research and policy",
    "newsUrl": "https://watercenter.sas.upenn.edu/news",
    "magazineUrl": null,
    "notes": "SAS Drupal - JS-rendered",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "pennovation-center",
    "name": "Pennovation Center",
    "parentUnit": "Penn",
    "bucket": "Center",
    "subhead": "Innovation and entrepreneurship",
    "newsUrl": "https://pennovation.upenn.edu/news",
    "magazineUrl": null,
    "notes": "",
    "posts": [],
    "feedUrl": "https://pennovation.upenn.edu/feed/"
  },
  {
    "id": "herbert-d-katz-center-for-advanced-judaic-studies",
    "name": "Herbert D Katz Center",
    "parentUnit": "SAS",
    "bucket": "Center",
    "subhead": "Judaic studies",
    "newsUrl": "https://katz.sas.upenn.edu/blog/katz-center",
    "magazineUrl": null,
    "notes": "FLAGGED 2026-08-04: confirmed real content here (article.teaser containers) but NO date shown anywhere in the DOM, and the posts visible look years old (image paths from 2019). This may not be a live reverse-chronological feed at all — worth checking katz.sas.upenn.edu for a proper dated news/blog archive URL instead of enabling date_optional here (which would make stale posts look freshly published every run).",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "mcneil-center-for-early-american-studies",
    "name": "McNeil Center for Early American Studies",
    "parentUnit": "Penn",
    "bucket": "Center",
    "subhead": "Early American history",
    "newsUrl": "https://www.mceas.org/news",
    "magazineUrl": null,
    "notes": "",
    "posts": [],
    "feedUrl": "https://www.mceas.org/feed/"
  },
  {
    "id": "fels-institute-of-government",
    "name": "Fels Institute of Government",
    "parentUnit": "Penn",
    "bucket": "Institute",
    "subhead": "Public policy and governance",
    "newsUrl": "https://www.fels.upenn.edu/news-events",
    "magazineUrl": null,
    "notes": "",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "institute-of-contemporary-art",
    "name": "Institute of Contemporary Art",
    "parentUnit": "Penn",
    "bucket": "Institute",
    "subhead": "Contemporary art and culture",
    "newsUrl": "https://icaphila.org/press/",
    "magazineUrl": null,
    "notes": "",
    "posts": [],
    "feedUrl": "https://icaphila.org/feed/"
  },
  {
    "id": "the-lauder-institute",
    "name": "The Lauder Institute",
    "parentUnit": "Wharton",
    "bucket": "Institute",
    "subhead": "Global management and languages",
    "newsUrl": "https://lauder.wharton.upenn.edu/news/",
    "magazineUrl": null,
    "notes": "",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "vagelos-institute-for-energy-science-and-technology",
    "name": "Vagelos Institute for Energy Science",
    "parentUnit": "SEAS",
    "bucket": "Institute",
    "subhead": "Energy science and technology",
    "newsUrl": "https://viest.upenn.edu/news",
    "magazineUrl": null,
    "notes": "Site working correctly — most recent article is Feb 2026, so nothing appears in current week view. Not a scraper bug.",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "jerome-fisher-program-in-management-and-technology",
    "name": "Jerome Fisher Program",
    "parentUnit": "SEAS/Wharton",
    "bucket": "Program",
    "subhead": "Management and technology",
    "newsUrl": "https://fisher.wharton.upenn.edu/news/",
    "magazineUrl": null,
    "notes": "",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "penn-program-on-opinion-research-and-election-studies",
    "name": "Penn Program on Opinion Research",
    "parentUnit": "Penn",
    "bucket": "Program",
    "subhead": "Opinion research and elections",
    "newsUrl": "https://pores.upenn.edu/news",
    "magazineUrl": null,
    "notes": "",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "snf-paideia-program",
    "name": "SNF Paideia Program",
    "parentUnit": "Penn",
    "bucket": "Program",
    "subhead": "Civic engagement and dialogue",
    "newsUrl": "https://snfpaideia.upenn.edu/media-center/",
    "magazineUrl": null,
    "notes": "",
    "posts": [],
    "feedUrl": "https://snfpaideia.upenn.edu/feed/"
  },
  {
    "id": "digital-humanities-price-lab",
    "name": "Digital Humanities / Price Lab",
    "parentUnit": "SAS",
    "bucket": "Lab",
    "subhead": "Digital humanities research",
    "newsUrl": "https://pricelab.sas.upenn.edu/news",
    "magazineUrl": null,
    "notes": "",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "grasp-lab",
    "name": "GRASP Lab",
    "parentUnit": "SEAS",
    "bucket": "Lab",
    "subhead": "Robotics and perception",
    "newsUrl": "https://www.grasp.upenn.edu/news/",
    "magazineUrl": null,
    "notes": "",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "penn-eii",
    "name": "Penn Climate (fka EII)",
    "parentUnit": "Penn",
    "bucket": "Affiliate",
    "subhead": "Climate science, policy, and action",
    "newsUrl": "https://climate.upenn.edu/news/news/",
    "magazineUrl": null,
    "notes": "URL fixed 2026-08-04: the Environmental Innovations Initiative was absorbed into the new Office of the Vice Provost for Climate Science, Policy, and Action (\"Penn Climate\") in 2024–2026; environment.upenn.edu now redirects to climate.upenn.edu. Old news-events/news path 404s under the new site. 2026-10-28: /news-knowledge/news/ also 404s; real listing is /news/news/.",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "penn-global",
    "name": "Penn Global",
    "parentUnit": "Penn",
    "bucket": "Affiliate",
    "subhead": "Global engagement and partnerships",
    "newsUrl": "https://global.upenn.edu/penn-global-news/",
    "magazineUrl": null,
    "notes": "",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "penn-iur",
    "name": "Penn IUR",
    "parentUnit": "Penn",
    "bucket": "Affiliate",
    "subhead": "Urban research and practice",
    "newsUrl": "https://penniur.upenn.edu/media/news",
    "magazineUrl": null,
    "notes": "",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "penn-sustainability",
    "name": "Penn Sustainability",
    "parentUnit": "Penn",
    "bucket": "Affiliate",
    "subhead": "Campus sustainability initiatives",
    "newsUrl": "https://www.sustainability.upenn.edu/news",
    "magazineUrl": null,
    "notes": "No dates shown on this page; the monitor keeps the 7 newest stories.",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "penn-washington",
    "name": "Penn Washington",
    "parentUnit": "Penn",
    "bucket": "Affiliate",
    "subhead": "Penn in Washington DC",
    "newsUrl": "https://global.upenn.edu/penn-washington/penn-washington-news/",
    "magazineUrl": null,
    "notes": "",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "kelly-writers-house",
    "name": "Kelly Writers House",
    "parentUnit": "Penn",
    "bucket": "House",
    "subhead": "Writing, literature, arts",
    "newsUrl": "https://writing.upenn.edu/wh/about/news/",
    "magazineUrl": null,
    "notes": "",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "perry-world-house",
    "name": "Perry World House",
    "parentUnit": "Penn",
    "bucket": "House",
    "subhead": "Global affairs and policy",
    "newsUrl": "https://perryworldhouse.upenn.edu/news-and-insight/",
    "magazineUrl": null,
    "notes": "No dates shown on this page; the monitor keeps the 7 newest stories.",
    "posts": [],
    "feedUrl": "https://perryworldhouse.upenn.edu/feed/"
  },
  {
    "id": "platt-house",
    "name": "Platt House",
    "parentUnit": "Penn",
    "bucket": "House",
    "subhead": "Penn communications source",
    "newsUrl": "https://platthouse.universitylife.upenn.edu/community-news-and-stories/",
    "magazineUrl": null,
    "notes": "Shares blog with Katz Center",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "arthur-ross-gallery",
    "name": "Arthur Ross Gallery",
    "parentUnit": "Penn",
    "bucket": "Gallery",
    "subhead": "Art exhibitions and collections",
    "newsUrl": "https://arthurrossgallery.org/press-releases/",
    "magazineUrl": null,
    "notes": "",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "penn-museum",
    "name": "Penn Museum",
    "parentUnit": "Penn",
    "bucket": "Museum",
    "subhead": "Archaeology, collections, public humanities",
    "newsUrl": "https://www.penn.museum/about/press-room/press-releases",
    "magazineUrl": null,
    "notes": "",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "penn-libraries",
    "name": "Penn Libraries",
    "parentUnit": "Penn",
    "bucket": "Library",
    "subhead": "Collections, scholarship, research services",
    "newsUrl": "https://www.library.upenn.edu/news/all",
    "magazineUrl": null,
    "notes": "",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "comparative-literature",
    "name": "Comparative Literature",
    "parentUnit": "SAS",
    "bucket": "Department",
    "subhead": "",
    "newsUrl": "https://complit.sas.upenn.edu/news",
    "magazineUrl": null,
    "notes": "Added from owner source list, November 3, 2026.",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "classics",
    "name": "Classics",
    "parentUnit": "SAS",
    "bucket": "Department",
    "subhead": "",
    "newsUrl": "https://www.classics.upenn.edu/news",
    "magazineUrl": null,
    "notes": "Added from owner source list, November 3, 2026.",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "spanish",
    "name": "Spanish",
    "parentUnit": "SAS",
    "bucket": "Department",
    "subhead": "",
    "newsUrl": "https://spanish.sas.upenn.edu/news",
    "magazineUrl": null,
    "notes": "Added from owner source list, November 3, 2026.",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "pan-school",
    "name": "Pan-School news",
    "parentUnit": "SAS",
    "bucket": "Department",
    "subhead": "",
    "newsUrl": "https://pan-school.sas.upenn.edu/news",
    "magazineUrl": null,
    "notes": "Added from owner source list, November 3, 2026.",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "chibe",
    "name": "CHIBE",
    "parentUnit": "Medicine",
    "bucket": "Center",
    "subhead": "",
    "newsUrl": "https://chibe.upenn.edu/blog/",
    "magazineUrl": null,
    "notes": "Added from owner source list, November 3, 2026.",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "biology",
    "name": "Biology",
    "parentUnit": "SAS",
    "bucket": "Department",
    "subhead": "",
    "newsUrl": "https://www.bio.upenn.edu/news",
    "magazineUrl": null,
    "notes": "Added from owner source list, November 3, 2026.",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "chemistry",
    "name": "Chemistry",
    "parentUnit": "SAS",
    "bucket": "Department",
    "subhead": "",
    "newsUrl": "https://www.chem.upenn.edu/news",
    "magazineUrl": null,
    "notes": "Added from owner source list, November 3, 2026.",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "linguistics",
    "name": "Linguistics",
    "parentUnit": "SAS",
    "bucket": "Department",
    "subhead": "",
    "newsUrl": "https://www.ling.upenn.edu/news/",
    "magazineUrl": null,
    "notes": "Added from owner source list, November 3, 2026.",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "cinema-media-studies",
    "name": "Cinema & Media Studies",
    "parentUnit": "SAS",
    "bucket": "Department",
    "subhead": "",
    "newsUrl": "https://cinemastudies.sas.upenn.edu/news",
    "magazineUrl": null,
    "notes": "Added from owner source list, November 3, 2026.",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "earth-environmental-science",
    "name": "Earth & Environmental Science",
    "parentUnit": "SAS",
    "bucket": "Department",
    "subhead": "",
    "newsUrl": "https://earth.sas.upenn.edu/index%2ephp/news",
    "magazineUrl": null,
    "notes": "Added from owner source list, November 3, 2026.",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "economics",
    "name": "Economics",
    "parentUnit": "SAS",
    "bucket": "Department",
    "subhead": "",
    "newsUrl": "https://economics.sas.upenn.edu/news",
    "magazineUrl": null,
    "notes": "Added from owner source list, November 3, 2026.",
    "posts": [],
    "feedUrl": null
  },
  {
    "id": "french-italian-germanic-studies",
    "name": "French, Italian & Germanic Studies",
    "parentUnit": "SAS",
    "bucket": "Department",
    "subhead": "",
    "newsUrl": "https://figs.sas.upenn.edu/news",
    "magazineUrl": null,
    "notes": "Added from owner source list, November 3, 2026.",
    "posts": [],
    "feedUrl": null
  }
];

window.PENN_MONITOR_GROUPS = [
  {
    "id": "engineering",
    "label": "Engineering",
    "color": "#1a3a6b",
    "sites": [
      "seas",
      "grasp-lab",
      "vagelos-institute-for-energy-science-and-technology",
      "jerome-fisher-program-in-management-and-technology",
      "pennovation-center"
    ]
  },
  {
    "id": "wharton",
    "label": "Wharton",
    "color": "#8b1a1a",
    "sites": [
      "wharton",
      "knowledge-at-wharton",
      "the-lauder-institute"
    ]
  },
  {
    "id": "medicine",
    "label": "Medicine",
    "color": "#0f4c35",
    "sites": [
      "medicine",
      "nursing",
      "dental"
    ]
  },
  {
    "id": "vet",
    "label": "Vet",
    "color": "#1a4a2a",
    "sites": [
      "vet"
    ]
  },
  {
    "id": "sas",
    "label": "Arts & Sciences",
    "color": "#4a2060",
    "sites": [
      "sas-omnia",
      "annenberg",
      "appc",
      "andrea-mitchell-center-for-the-study-of-democracy",
      "center-for-east-asian-studies",
      "center-for-study-of-contemporary-china",
      "center-for-the-study-of-ethnicity-race-immigration",
      "the-water-center",
      "digital-humanities-price-lab",
      "center-for-creative-writing",
      "kelly-writers-house",
      "herbert-d-katz-center-for-advanced-judaic-studies"
    ]
  },
  {
    "id": "law-policy",
    "label": "Law & Policy",
    "color": "#2d3a1a",
    "sites": [
      "law",
      "fels-institute-of-government",
      "penn-program-on-opinion-research-and-election-studies"
    ]
  },
  {
    "id": "education-social",
    "label": "Education & Social Policy",
    "color": "#3a2010",
    "sites": [
      "gse",
      "sp2",
      "snf-paideia-program"
    ]
  },
  {
    "id": "design",
    "label": "Weitzman / Design",
    "color": "#1a3040",
    "sites": [
      "weitzman",
      "kleinman-center-for-energy-policy"
    ]
  },
  {
    "id": "global",
    "label": "Global & Civic",
    "color": "#1a2a40",
    "sites": [
      "penn-global",
      "penn-washington",
      "perry-world-house",
      "penn-eii",
      "penn-sustainability",
      "penn-iur",
      "mcneil-center-for-early-american-studies"
    ]
  },
  {
    "id": "arts-culture",
    "label": "Arts & Culture",
    "color": "#5a2a00",
    "sites": [
      "penn-museum",
      "institute-of-contemporary-art",
      "arthur-ross-gallery",
      "penn-libraries",
      "platt-house"
    ]
  },
  {
    "id": "innovation",
    "label": "Innovation & Enterprise",
    "color": "#2a1a10",
    "sites": [
      "penn-program-on-opinion-research-and-election-studies"
    ]
  }
];
