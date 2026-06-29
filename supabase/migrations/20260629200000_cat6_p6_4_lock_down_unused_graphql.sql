-- P6-4 Option 1: the app uses zero GraphQL (all reads are REST/PostgREST via the
-- browser anon client). The auto-exposed GraphQL API only serves to leak table
-- schemas (advisors 0026/0027) to anon/authenticated. Revoke USAGE on the GraphQL
-- schemas from the API roles so the endpoint is closed for them. REST is unaffected
-- (it uses the public schema); service_role/postgres retain access.
revoke usage on schema graphql_public from anon, authenticated;
revoke usage on schema graphql from anon, authenticated;
