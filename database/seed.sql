-- Sales Canvas — demo dataset.
-- Idempotent: every INSERT uses ON CONFLICT DO NOTHING. Re-runs are safe.
--
-- Canvas layout: prospects + accounts arranged in a loose pipeline left→right,
-- followups + objections clustered around their targets, drafts hang below
-- their source, automation results stacked top-right.

-- ----- workspace + user -----
INSERT INTO workspaces (id, slug, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'demo', 'Sales Canvas demo')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO users (id, workspace_id, name, email, role) VALUES
  ('00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-000000000001',
   'Demo Manager', 'manager@demo.local', 'manager')
ON CONFLICT (email) DO NOTHING;

-- ----- canvas -----
INSERT INTO canvases (id, workspace_id, name) VALUES
  ('00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-000000000001',
   'Main board')
ON CONFLICT (id) DO NOTHING;

-- ----- prospects (10) — leftmost column -----
INSERT INTO canvas_nodes
  (id, workspace_id, canvas_id, node_type, title, body, status, tags_json, position_x, position_y)
VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1',
   'prospect','Ava Chen — Northstar Robotics','VP Ops · 240-person fleet ops · evaluating canvas tools', 'open',
   '["enterprise","west"]', 80, 80),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1',
   'prospect','Daniel Park — Kestrel Freight','Director of Driver Services · 80 trucks · Slack-heavy', 'open',
   '["smb","midwest"]', 80, 260),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1',
   'prospect','Priya Iyer — Halcyon Logistics','COO · 320 power units · TMS modernization in flight','in_progress',
   '["mid-market"]', 80, 440),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1',
   'prospect','Marcus Vega — Orbital Cargo','Head of Ops · 50 owner-operators · payroll pain','open',
   '["smb"]', 80, 620),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1',
   'prospect','Sofia Marin — Riverbend Distribution','VP Operations · 110 trucks · Friday close pain','open',
   '["smb","south"]', 80, 800),
  ('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1',
   'prospect','Theo Blackwood — Pivot Carriers','CRO · interested in pilot in Q3','open',
   '["champion"]', 80, 980),
  ('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1',
   'prospect','Naomi Ostrom — Greater Lakes Transit','Ops Manager · 60 trucks · current tool is shared sheets','open',
   '["smb","midwest"]', 80, 1160),
  ('10000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1',
   'prospect','Rafael Costa — Meridian Freight','Director · 180 trucks · evaluating against Motive','in_progress',
   '["competitive"]', 80, 1340),
  ('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1',
   'prospect','Lina Patel — Avalon Trucking','VP Driver Services · 95 trucks · price-sensitive','open',
   '["price-sensitive"]', 80, 1520),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1',
   'prospect','Hank Robinson — Cinder Hauling','Owner-operator op · 35 trucks · referred by Northstar','open',
   '["warm-intro"]', 80, 1700)
ON CONFLICT (id) DO NOTHING;

-- ----- accounts (5) — second column -----
INSERT INTO canvas_nodes
  (id, workspace_id, canvas_id, node_type, title, body, status, tags_json, position_x, position_y)
VALUES
  ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1',
   'account','Account · Helios Trucking','Pilot live · 4-week scoped · payroll champion confirmed','in_progress',
   '["pilot-live"]', 460, 80),
  ('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1',
   'account','Account · BlueRidge Freight','Closed-won · Q2 2026 · expansion conversation underway','resolved',
   '["expansion"]', 460, 260),
  ('20000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1',
   'account','Account · Atlas Distribution','Renewal in 90 days · CSM weekly cadence','in_progress',
   '["renewal"]', 460, 440),
  ('20000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1',
   'account','Account · Sunrise Carriers','Stripe billing live · usage steady · no risk signal','resolved',
   '["healthy"]', 460, 620),
  ('20000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1',
   'account','Account · CedarPoint Logistics','At-risk · usage dropped 40% last 30 days','needs_review',
   '["at-risk"]', 460, 800)
ON CONFLICT (id) DO NOTHING;

-- ----- objections (5) -----
INSERT INTO canvas_nodes
  (id, workspace_id, canvas_id, node_type, title, body, status, tags_json, position_x, position_y, source_id)
VALUES
  ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1',
   'objection','"Already paying for Motive"','Rafael (Meridian) says he is locked into a Motive seat count he isn''t using','open',
   '["pricing"]', 840, 1340, '10000000-0000-0000-0000-000000000008'),
  ('30000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1',
   'objection','"What if AI sends something wrong?"','Daniel (Kestrel) — needs reassurance on human-approval gates','open',
   '["trust"]', 840, 260, '10000000-0000-0000-0000-000000000002'),
  ('30000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1',
   'objection','"Need integration with our payroll system"','Priya — must hear roadmap on payroll export','in_progress',
   '["integration"]', 840, 440, '10000000-0000-0000-0000-000000000003'),
  ('30000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1',
   'objection','"Procurement requires SOC 2"','Sofia (Riverbend) — share the compliance roadmap one-pager','open',
   '["security"]', 840, 800, '10000000-0000-0000-0000-000000000005'),
  ('30000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1',
   'objection','"How is this different from a CRM?"','Lina (Avalon) — pitch the canvas vs table distinction directly','open',
   '["positioning"]', 840, 1520, '10000000-0000-0000-0000-000000000009')
ON CONFLICT (id) DO NOTHING;

-- ----- followups (8) -----
INSERT INTO canvas_nodes
  (id, workspace_id, canvas_id, node_type, title, body, status, tags_json, position_x, position_y, source_id)
VALUES
  ('40000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1',
   'followup','FU: Send Ava the pilot one-pager','Promised by Friday','open','["this-week"]', 1220, 80,
   '10000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1',
   'followup','FU: Loop CISO into Sofia thread','For SOC 2 evidence','open','["security"]', 1220, 800,
   '10000000-0000-0000-0000-000000000005'),
  ('40000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1',
   'followup','FU: Pricing comparison vs Motive','Specifically Rafael''s seat-count issue','in_progress','["pricing"]', 1220, 1340,
   '10000000-0000-0000-0000-000000000008'),
  ('40000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1',
   'followup','FU: Schedule Helios QBR','Q1 pilot recap + Q2 expansion','open','["renewal"]', 1220, 80,
   '20000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1',
   'followup','FU: CedarPoint usage review','Investigate the 40% drop','needs_review','["at-risk"]', 1220, 800,
   '20000000-0000-0000-0000-000000000005'),
  ('40000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1',
   'followup','FU: Theo Q3 pilot timing','Need to lock the scoping call','open','["champion"]', 1220, 980,
   '10000000-0000-0000-0000-000000000006'),
  ('40000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1',
   'followup','FU: Naomi onboarding doc','Send the shared-sheets-replacement deck','open','["smb"]', 1220, 1160,
   '10000000-0000-0000-0000-000000000007'),
  ('40000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1',
   'followup','FU: Hank intro thank-you to Ava','Northstar referred Hank','open','["warm-intro"]', 1220, 1700,
   '10000000-0000-0000-0000-00000000000a')
ON CONFLICT (id) DO NOTHING;

-- ----- call summaries (3) -----
INSERT INTO canvas_nodes
  (id, workspace_id, canvas_id, node_type, title, body, status, tags_json, position_x, position_y, source_id)
VALUES
  ('50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1',
   'call_summary','Call: Ava Chen · pilot scoping',
   'Walked the four pillars. Ava resonated with Settlement Intelligence. Action: send the security one-pager. Sentiment: positive.',
   'resolved','["positive"]', 1600, 80, '10000000-0000-0000-0000-000000000001'),
  ('50000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1',
   'call_summary','Call: Helios QBR prep · CSM sync',
   'Pilot expansion green; payroll champion confirmed. Risk: their CFO has not seen the ROI deck.',
   'in_progress','["expansion"]', 1600, 260, '20000000-0000-0000-0000-000000000001'),
  ('50000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1',
   'call_summary','Call: Sofia · security review',
   'IT/security on the call. Their procurement needs a written SOC 2 timeline. We committed to send it within 48h.',
   'in_progress','["security"]', 1600, 800, '10000000-0000-0000-0000-000000000005')
ON CONFLICT (id) DO NOTHING;

-- ----- email drafts (3) -----
INSERT INTO canvas_nodes
  (id, workspace_id, canvas_id, node_type, title, body, status, tags_json, position_x, position_y, source_id)
VALUES
  ('60000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1',
   'email_draft','Draft email: Ava — pilot one-pager',
   'Hi Ava — thanks for the time today. Attaching the pilot one-pager we discussed. I can hold time Thursday or Friday to walk your CISO through the security posture. — Mgr',
   'open','["draft"]', 1980, 80, '10000000-0000-0000-0000-000000000001'),
  ('60000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1',
   'email_draft','Draft email: Rafael — pricing reframe',
   'Rafael — heard the Motive seat-count concern loud and clear. A short note on how our pricing works for partial-fleet pilots: ... Can we book 20 min Wed?',
   'open','["draft","pricing"]', 1980, 1340, '10000000-0000-0000-0000-000000000008'),
  ('60000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1',
   'email_draft','Draft email: Sofia — SOC 2 timeline',
   'Sofia — as promised, here is our written compliance roadmap (Today / Next 6 months / Later). Happy to put your IT lead in touch with our security owner directly.',
   'open','["draft","security"]', 1980, 800, '10000000-0000-0000-0000-000000000005')
ON CONFLICT (id) DO NOTHING;

-- ----- LinkedIn drafts (3) -----
INSERT INTO canvas_nodes
  (id, workspace_id, canvas_id, node_type, title, body, status, tags_json, position_x, position_y, source_id)
VALUES
  ('70000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1',
   'linkedin_draft','LI draft: Theo — warm follow-up',
   'Hey Theo — appreciated the candid Q3 timing conversation. When you''re ready to scope, I can put 30 min on the calendar with our founders.',
   'open','["draft","champion"]', 2360, 980, '10000000-0000-0000-0000-000000000006'),
  ('70000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1',
   'linkedin_draft','LI draft: Hank — referral thank-you',
   'Hank — Ava at Northstar mentioned you were poking at the same problems. Want to compare notes for 20 min?',
   'open','["draft","warm-intro"]', 2360, 1700, '10000000-0000-0000-0000-00000000000a'),
  ('70000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1',
   'linkedin_draft','LI draft: Lina — positioning reframe',
   'Lina — quick note: we are not a CRM. Think of the canvas as the in-between-the-CRM-tabs workspace where the real work happens. Worth 25 min?',
   'open','["draft","positioning"]', 2360, 1520, '10000000-0000-0000-0000-000000000009')
ON CONFLICT (id) DO NOTHING;

-- ----- automation result notes (3) — top-right cluster -----
INSERT INTO canvas_nodes
  (id, workspace_id, canvas_id, node_type, title, body, status, tags_json, position_x, position_y)
VALUES
  ('80000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1',
   'automation_result','Stripe connection verified',
   'Routine: stripe.connection.check · Result: OK · Account ID matched test mode · No write performed.',
   'resolved','["stripe","auto"]', 2740, 80),
  ('80000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1',
   'automation_result','Stripe check — needs review',
   'Routine: stripe.connection.check · Result: ambiguous (test mode account name mismatch). Manual confirmation required.',
   'needs_review','["stripe","auto"]', 2740, 260),
  ('80000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1',
   'automation_result','Stripe connection verified',
   'Routine: stripe.connection.check · Result: OK · Latency 312ms · Triggered via Shift+A→C from Helios account.',
   'resolved','["stripe","auto"]', 2740, 440)
ON CONFLICT (id) DO NOTHING;

-- ----- a few example edges to suggest relationships -----
INSERT INTO canvas_edges
  (id, workspace_id, canvas_id, source_node_id, target_node_id, label)
VALUES
  ('a0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1',
   '10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','call'),
  ('a0000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1',
   '50000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','draft'),
  ('a0000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1',
   '10000000-0000-0000-0000-000000000008','30000000-0000-0000-0000-000000000001','raised'),
  ('a0000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1',
   '30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000003','followup'),
  ('a0000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1',
   '40000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-000000000002','draft')
ON CONFLICT (id) DO NOTHING;

-- ----- seed connectors row for Stripe -----
INSERT INTO connectors (id, workspace_id, kind, status)
VALUES
  ('b0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','stripe','disconnected')
ON CONFLICT (workspace_id, kind) DO NOTHING;
