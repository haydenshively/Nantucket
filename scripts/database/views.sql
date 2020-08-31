DROP VIEW IF EXISTS ctokunderlying CASCADE;
CREATE VIEW ctokunderlying AS
  SELECT ctokens.id, ctokens.address, ctokens.collateralfactor AS collat, utokens.costineth
  FROM ctokens, utokens
  WHERE ctokens.utokenid=utokens.id;

DROP VIEW IF EXISTS usersnonzero;
CREATE VIEW usersnonzero AS
  SELECT * FROM users
  WHERE users.profitability!=0 AND users.liquidity>0;