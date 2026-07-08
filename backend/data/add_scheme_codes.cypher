// Stamp scheme_code (SIF-xx) onto Fund nodes.
// Source: funds.json fundsIndex[].sifCode (16) + NAV scheme_master (9),
// joined to graph funds by name. Match key = fund_id (graph-authoritative).
// NOTE: fund_id is stored as an INTEGER in the graph — match unquoted.
// Idempotent (SET). All 25 funds covered.

MATCH (f:Fund {fund_id: 20101}) SET f.scheme_code = "SIF-55";   // DynaSIF Equity Long-Short
MATCH (f:Fund {fund_id: 20304}) SET f.scheme_code = "SIF-80";   // Apex Hybrid Long-Short
MATCH (f:Fund {fund_id: 20701}) SET f.scheme_code = "SIF-62";   // Arudha Equity Long-Short
MATCH (f:Fund {fund_id: 20704}) SET f.scheme_code = "SIF-40";   // Arudha Hybrid Long-Short
MATCH (f:Fund {fund_id: 21404}) SET f.scheme_code = "SIF-11";   // Altiva Hybrid Long-Short
MATCH (f:Fund {fund_id: 21501}) SET f.scheme_code = "SIF-95";   // Sapphire Equity Long-Short
MATCH (f:Fund {fund_id: 22002}) SET f.scheme_code = "SIF-33";   // iSIF Equity Ex-Top 100 Long-Short
MATCH (f:Fund {fund_id: 22004}) SET f.scheme_code = "SIF-35";   // iSIF Hybrid Long-Short
MATCH (f:Fund {fund_id: 22201}) SET f.scheme_code = "SIF-21";   // Diviniti Equity Long-Short
MATCH (f:Fund {fund_id: 23601}) SET f.scheme_code = "SIF-3";    // qsif Equity Long-Short
MATCH (f:Fund {fund_id: 23602}) SET f.scheme_code = "SIF-25";   // qsif Equity Ex-Top 100 Long-Short
MATCH (f:Fund {fund_id: 23603}) SET f.scheme_code = "SIF-117";  // qsif Sector Rotation Long-Short
MATCH (f:Fund {fund_id: 23604}) SET f.scheme_code = "SIF-7";    // qsif Hybrid Long-Short
MATCH (f:Fund {fund_id: 23904}) SET f.scheme_code = "SIF-13";   // Magnum Hybrid Long-Short
MATCH (f:Fund {fund_id: 24101}) SET f.scheme_code = "SIF-102";  // Titanium Equity Long-Short
MATCH (f:Fund {fund_id: 24104}) SET f.scheme_code = "SIF-29";   // Titanium Hybrid Long-Short

// --- added after funds.json (codes supplied from NAV scheme_master) ---
MATCH (f:Fund {fund_id: 20105}) SET f.scheme_code = "SIF-87";   // DynaSIF Active Asset Allocator
MATCH (f:Fund {fund_id: 21402}) SET f.scheme_code = "SIF-122";  // Altiva Equity Ex-Top 100
MATCH (f:Fund {fund_id: 22001}) SET f.scheme_code = "SIF-126";  // iSIF Equity Long-Short
MATCH (f:Fund {fund_id: 22005}) SET f.scheme_code = "SIF-124";  // iSIF Active Asset Allocator
MATCH (f:Fund {fund_id: 22804}) SET f.scheme_code = "SIF-136";  // Platinum Hybrid Long-Short
MATCH (f:Fund {fund_id: 23605}) SET f.scheme_code = "SIF-93";   // qsif Active Asset Allocator
MATCH (f:Fund {fund_id: 24301}) SET f.scheme_code = "SIF-111";  // WSIF Equity Long-Short
MATCH (f:Fund {fund_id: 24302}) SET f.scheme_code = "SIF-105";  // WSIF Equity Ex-Top 100
MATCH (f:Fund {fund_id: 24601}) SET f.scheme_code = "SIF-114";  // Arthaya Equity Long-Short

// Verify:
// MATCH (f:Fund) RETURN f.fund_id, f.name, f.scheme_code ORDER BY f.fund_id;
