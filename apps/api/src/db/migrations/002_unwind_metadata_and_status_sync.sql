-- 002_unwind_metadata_and_status_sync.sql

-- 1. Add missing metadata column to unwind_executions
ALTER TABLE unwind_executions ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- 2. Sync execution_requests.status when loop/unwind status changes
CREATE OR REPLACE FUNCTION sync_execution_request_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE execution_requests SET status = NEW.status WHERE id = NEW.execution_request_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_loop_sync_status
  AFTER UPDATE OF status ON loop_executions
  FOR EACH ROW EXECUTE FUNCTION sync_execution_request_status();

CREATE TRIGGER tr_unwind_sync_status
  AFTER UPDATE OF status ON unwind_executions
  FOR EACH ROW EXECUTE FUNCTION sync_execution_request_status();
