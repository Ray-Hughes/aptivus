"""Shared schema + seed data for the SQL problems.

One realistic P&C insurance model, reused by every problem, so you learn the
tables once and then only think about the query.
"""

SCHEMA = """
CREATE TABLE brokers (
    broker_id         INTEGER PRIMARY KEY,
    broker_name       TEXT NOT NULL,
    region            TEXT,
    parent_broker_id  INTEGER REFERENCES brokers(broker_id)
);

CREATE TABLE underwriters (
    uw_id    INTEGER PRIMARY KEY,
    uw_name  TEXT NOT NULL,
    region   TEXT
);

CREATE TABLE accounts (
    account_id    INTEGER PRIMARY KEY,
    account_name  TEXT NOT NULL,
    industry      TEXT,
    state         TEXT
);

CREATE TABLE appetite (
    line_of_business TEXT NOT NULL,
    state            TEXT NOT NULL,
    tier             TEXT NOT NULL,     -- 'target' | 'neutral' | 'avoid'
    PRIMARY KEY (line_of_business, state)
);

CREATE TABLE submissions (
    submission_id     INTEGER PRIMARY KEY,
    account_id        INTEGER REFERENCES accounts(account_id),
    broker_id         INTEGER REFERENCES brokers(broker_id),
    uw_id             INTEGER REFERENCES underwriters(uw_id),
    line_of_business  TEXT,
    received_at       TEXT,             -- 'YYYY-MM-DD'
    status            TEXT              -- 'received'|'quoted'|'declined'|'bound'
);

CREATE TABLE quotes (
    quote_id      INTEGER PRIMARY KEY,
    submission_id INTEGER REFERENCES submissions(submission_id),
    premium       REAL,
    quoted_at     TEXT,
    status        TEXT                  -- 'issued' | 'bound'
);

CREATE TABLE policies (
    policy_id        INTEGER PRIMARY KEY,
    account_id       INTEGER REFERENCES accounts(account_id),
    quote_id         INTEGER REFERENCES quotes(quote_id),   -- NULL for legacy renewals
    effective_date   TEXT,
    expiration_date  TEXT,
    written_premium  REAL
);

CREATE TABLE claims (
    claim_id   INTEGER PRIMARY KEY,
    policy_id  INTEGER REFERENCES policies(policy_id),
    loss_date  TEXT,
    incurred   REAL
);
"""

SEED = """
INSERT INTO brokers VALUES
 (1,'Marsh','East',NULL),
 (2,'Aon','East',NULL),
 (3,'Gallagher','West',NULL),
 (4,'Marsh Midwest','Central',1),
 (5,'Marsh Pacific','West',1),
 (6,'Aon Southeast','East',2),
 (7,'Willis','West',NULL),
 (8,'Marsh Pacific North','West',5);

INSERT INTO underwriters VALUES
 (1,'Dana Reyes','East'),
 (2,'Sam Okafor','Central'),
 (3,'Priya Nair','West'),
 (4,'Tom Lindqvist','West');

INSERT INTO accounts VALUES
 (1,'Acme Manufacturing','Manufacturing','CA'),
 (2,'Borealis Logistics','Transportation','TX'),
 (3,'Cascade Foods','Food','WA'),
 (4,'Delta Metalworks','Manufacturing','OH'),
 (5,'Evergreen Hospitality','Hospitality','CA'),
 (6,'Foxtrot Energy','Energy','TX'),
 (7,'Granite Retail','Retail','NY'),
 (8,'Harbor Marine','Marine','FL'),
 (9,'Ionic Tech','Technology','CA'),
 (10,'Juniper Farms','Agriculture','IA'),
 (11,'Kestrel Aviation','Aviation','FL'),
 (12,'Lumen Health','Healthcare','NY');

INSERT INTO appetite VALUES
 ('Property','CA','avoid'),('Property','TX','target'),('Property','WA','target'),
 ('Property','OH','neutral'),('Property','NY','neutral'),('Property','FL','avoid'),
 ('GL','CA','target'),('GL','TX','neutral'),('GL','NY','target'),('GL','OH','avoid'),
 ('Cyber','CA','target'),('Cyber','NY','target'),('Cyber','TX','avoid'),
 ('Marine','FL','neutral'),('Auto','IA','target'),('Auto','TX','neutral');

INSERT INTO submissions VALUES
 (1 ,1 ,1,1,'Property','2026-01-05','bound'),
 (2 ,2 ,2,1,'Property','2026-01-09','bound'),
 (3 ,3 ,3,2,'GL'      ,'2026-01-15','quoted'),
 (4 ,4 ,4,2,'Property','2026-01-22','declined'),
 (5 ,5 ,1,3,'GL'      ,'2026-02-02','bound'),
 (6 ,6 ,5,3,'Cyber'   ,'2026-02-08','quoted'),
 (7 ,7 ,2,1,'Cyber'   ,'2026-02-14','bound'),
 (8 ,8 ,7,4,'Marine'  ,'2026-02-19','declined'),
 (9 ,9 ,1,2,'Cyber'   ,'2026-02-25','bound'),
 (10,10,3,4,'Auto'    ,'2026-03-03','quoted'),
 (11,11,7,4,'Property','2026-03-07','declined'),
 (12,12,6,1,'GL'      ,'2026-03-12','bound'),
 (13,1 ,1,1,'GL'      ,'2026-03-18','quoted'),
 (14,2 ,2,3,'Auto'    ,'2026-03-21','received'),
 (15,3 ,3,2,'Property','2026-04-02','bound'),
 (16,4 ,4,2,'GL'      ,'2026-04-06','received'),
 (17,5 ,5,3,'Property','2026-04-11','quoted'),
 (18,6 ,5,3,'GL'      ,'2026-04-15','bound'),
 (19,7 ,6,1,'Property','2026-04-19','declined'),
 (20,8 ,7,4,'Property','2026-04-24','received'),
 (21,9 ,1,2,'GL'      ,'2026-05-02','bound'),
 (22,10,3,4,'Property','2026-05-06','quoted'),
 (23,11,7,4,'Marine'  ,'2026-05-11','received'),
 (24,12,6,1,'Cyber'   ,'2026-05-15','bound');

INSERT INTO quotes VALUES
 (1 ,1 ,185000,'2026-01-12','bound'),
 (2 ,2 , 92000,'2026-01-14','bound'),
 (3 ,3 , 47500,'2026-01-27','issued'),
 (4 ,5 ,120000,'2026-02-06','bound'),
 (5 ,6 , 63000,'2026-02-20','issued'),
 (6 ,7 , 38000,'2026-02-17','bound'),
 (7 ,9 , 54000,'2026-03-04','bound'),
 (8 ,10, 26500,'2026-03-10','issued'),
 (9 ,12, 71000,'2026-03-15','bound'),
 (10,13, 33000,'2026-03-30','issued'),
 (11,15,210000,'2026-04-05','bound'),
 (12,17, 88000,'2026-04-18','issued'),
 (13,18, 45000,'2026-04-20','bound'),
 (14,21, 99000,'2026-05-08','bound'),
 (15,22,150000,'2026-05-20','issued'),
 (16,24, 41000,'2026-05-19','bound');

INSERT INTO policies VALUES
 (1 ,1 ,1   ,'2026-02-01','2027-02-01',185000),
 (2 ,2 ,2   ,'2026-02-01','2027-02-01', 92000),
 (3 ,5 ,4   ,'2026-03-01','2027-03-01',120000),
 (4 ,7 ,6   ,'2026-03-01','2027-03-01', 38000),
 (5 ,9 ,7   ,'2026-03-15','2027-03-15', 54000),
 (6 ,12,9   ,'2026-04-01','2027-04-01', 71000),
 (7 ,3 ,11  ,'2026-05-01','2027-05-01',210000),
 (8 ,6 ,13  ,'2026-05-01','2027-05-01', 45000),
 (9 ,9 ,14  ,'2026-06-01','2027-06-01', 99000),
 (10,12,16  ,'2026-06-01','2027-06-01', 41000),
 (11,1 ,NULL,'2025-01-01','2026-01-01',170000),
 (12,2 ,NULL,'2025-01-01','2026-02-01', 88000),
 (13,5 ,NULL,'2025-02-01','2026-02-15',110000),
 (14,9 ,NULL,'2025-03-15','2026-03-15', 50000),
 (15,3 ,NULL,'2025-05-01','2026-05-01',195000);

INSERT INTO claims VALUES
 (1,1 ,'2026-04-10', 45000),
 (2,1 ,'2026-06-02', 12000),
 (3,3 ,'2026-05-20',130000),
 (4,5 ,'2026-04-01',  8000),
 (5,7 ,'2026-07-01', 25000),
 (6,2 ,'2026-03-15',     0),
 (7,11,'2025-06-01', 60000),
 (8,13,'2025-09-09', 15000);
"""
