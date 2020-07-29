SELECT setval('ctokens_id_seq', MAX(id)) FROM ctokens;
SELECT setval('utokens_id_seq', MAX(id)) FROM utokens;
SELECT setval('payseizepairs_id_seq', MAX(id)) FROM payseizepairs;
SELECT setval('users_id_seq', MAX(id)) FROM users;