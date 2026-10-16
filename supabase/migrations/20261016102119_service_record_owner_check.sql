-- save_record is intentionally callable by service_role (MCP/import tooling).
-- Its authorization expression references this session-scoped boolean helper;
-- PostgreSQL may check function privileges even when the service-role branch
-- makes that predicate unnecessary. Permit that narrow check without exposing
-- auth.users or expanding authenticated/anonymous access.
grant execute on function private.is_santorio_owner() to service_role;
