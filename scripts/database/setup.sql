DROP TABLE UTokens CASCADE;
CREATE TABLE UTokens (
  id                smallserial primary key not null,
  address           char(40) unique not null,
  name              varchar(50) not null,
  symbol            varchar(10) not null,

  costInEth         numeric(36, 18) not null
);

DROP TABLE CTokens CASCADE;
CREATE TABLE CTokens (
  id                smallserial primary key not null,
  address           char(40) unique not null,
  name              varchar(50) not null,
  symbol            varchar(10) not null,

  exchangeRate      numeric(36, 18) not null,
  borrowRate        numeric(36, 18) not null,
  supplyRate        numeric(36, 18) not null,
  utokenID          smallint  references UTokens(id)    
);

DROP TABLE Users CASCADE;
CREATE TABLE Users (
  id                serial primary key not null,
  address           char(40) unique not null
);

DROP TABLE Borrows;
CREATE TABLE Borrows (
  id                serial primary key not null,
  userID            integer   references Users(id),
  ctokenID          smallint  references CTokens(id),
  amountUnderlying  numeric(36, 18)
);

DROP TABLE Supplies;
CREATE TABLE Supplies (
  id                serial primary key not null,
  userID            integer   references Users(id),
  ctokenID          smallint  references CTokens(id),
  amountUnderlying  numeric(36, 18)
);