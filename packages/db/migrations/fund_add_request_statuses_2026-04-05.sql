-- Zjednodušení stavů fronty požadavků na fondy (bez approval workflow)
UPDATE fund_add_requests SET status = 'in_progress' WHERE status IN ('under_review', 'need_info');
UPDATE fund_add_requests SET status = 'added' WHERE status = 'approved';
UPDATE fund_add_requests SET status = 'new' WHERE status NOT IN ('new', 'in_progress', 'added', 'rejected');
