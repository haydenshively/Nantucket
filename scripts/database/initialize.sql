-- DROP TABLE IF EXISTS UTokens CASCADE;
-- CREATE TABLE UTokens (
--   id                smallserial primary key not null,
--   address           char(40) unique not null,
--   name              varchar(50),
--   symbol            varchar(10),

--   costInEth         numeric(36, 18)
-- );

-- DROP TABLE IF EXISTS CTokens CASCADE;
-- CREATE TABLE CTokens (
--   id                smallserial primary key not null,
--   address           char(40) unique not null,
--   name              varchar(50) not null,
--   symbol            varchar(10) not null,

--   collateralFactor  real not null,
--   exchangeRate      numeric(20, 18) not null,
--   borrowRate        numeric(20, 18) not null,
--   supplyRate        numeric(20, 18) not null,
--   utokenID          smallint not null   references UTokens(id)    
-- );

-- DROP TABLE IF EXISTS PaySeizePairs CASCADE;
-- CREATE TABLE PaySeizePairs (
--   id                serial primary key not null,
--   ctokenIDPay       integer not null    references CTokens(id),
--   ctokenIDSeize     integer not null    references CTokens(id),
--   unique (ctokenIDPay, ctokenIDSeize),
--   CHECK (ctokenIDPay!=ctokenIDSeize)
-- );

-- DROP TABLE IF EXISTS Users CASCADE;
-- CREATE TABLE Users (
--   id                serial primary key not null,
--   address           char(40) unique not null,
  
--   liquidity         numeric(36, 18) not null,
--   profitability     numeric(36, 18) not null,
--   pairID            integer   references PaySeizePairs(id),
--   blockUpdated      bigint not null
-- );

DROP RULE IF EXISTS NewerBlock ON Users;
CREATE RULE NewerBlock AS ON UPDATE TO Users
  WHERE NEW.blockUpdated<=OLD.blockUpdated
  DO INSTEAD NOTHING;