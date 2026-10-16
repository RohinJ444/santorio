import {expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('./supabase',()=>({adminClient:vi.fn()}));
import {fetchClientMetadata} from './cimd';
it.skipIf(process.env.SANTORIO_LIVE_TESTS!=='1')('loads ChatGPT production CIMD through the pinned-DNS fetcher',async()=>{const client=await fetchClientMetadata('https://chatgpt.com/oauth/client.json');expect(client.client_id).toBe('https://chatgpt.com/oauth/client.json');expect(client.token_endpoint_auth_method).toBe('none');expect(client.redirect_uris).toContain('https://chatgpt.com/connector_platform_oauth_redirect');},15000);
