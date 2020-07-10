DROP VIEW IF EXISTS supplies CASCADE;
-- CREATE VIEW supplies AS
--   SELECT * FROM credit WHERE credit.amountunderlying>0;

DROP VIEW IF EXISTS borrows CASCADE;
-- CREATE VIEW borrows AS
--   SELECT * FROM credit WHERE credit.amountunderlying<0;

DROP VIEW IF EXISTS ctokunderlying CASCADE;
CREATE VIEW ctokunderlying AS
  SELECT ctokens.id, ctokens.address, ctokens.collateralfactor AS collat, utokens.costineth
  FROM ctokens, utokens
  WHERE ctokens.utokenid=utokens.id;

DROP VIEW IF EXISTS creditwitheth CASCADE;
-- CREATE VIEW creditwitheth AS
--   SELECT credit.userid, ctokunderlying.address, credit.amountunderlying, ctokunderlying.collat, ctokunderlying.costineth
--   FROM credit, ctokunderlying
--   WHERE credit.ctokenid=ctokunderlying.id;

DROP VIEW IF EXISTS creditineth;
-- CREATE VIEW creditineth AS SELECT userid, address, amountunderlying*costineth as eth FROM creditwitheth;