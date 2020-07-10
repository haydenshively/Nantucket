DROP TABLE IF EXISTS UTokens CASCADE;
CREATE TABLE UTokens (
  id                smallserial primary key not null,
  address           char(40) unique not null,
  name              varchar(50),
  symbol            varchar(10),

  costInEth         numeric(36, 18)
);

DROP TABLE IF EXISTS CTokens CASCADE;
CREATE TABLE CTokens (
  id                smallserial primary key not null,
  address           char(40) unique not null,
  name              varchar(50) not null,
  symbol            varchar(10) not null,

  collateralFactor  real not null,
  exchangeRate      numeric(20, 18) not null,
  borrowRate        numeric(20, 18) not null,
  supplyRate        numeric(20, 18) not null,
  utokenID          smallint not null  references UTokens(id)    
);

DROP TABLE IF EXISTS Users CASCADE;
CREATE TABLE Users (
  id                serial primary key not null,
  address           char(40) unique not null,
  liquidity         numeric(36, 18) not null,
  ts                TIMESTAMPTZ not null
);

DROP TABLE IF EXISTS Credit;
-- CREATE TABLE Credit (
--   id                serial primary key not null,
--   userID            integer not null   references Users(id),
--   ctokenID          smallint not null  references CTokens(id),
--   unique (userID, ctokenID),
--   amountUnderlying  numeric(36, 18) not null
-- );
