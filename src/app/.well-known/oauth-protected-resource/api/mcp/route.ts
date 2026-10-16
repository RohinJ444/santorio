import {appUrl} from '@/lib/server/http';
import {resourceUrl,oauthJson,SCOPES} from '@/lib/server/oauth';
export function GET(){return oauthJson({resource:resourceUrl(),authorization_servers:[appUrl()],scopes_supported:SCOPES,bearer_methods_supported:['header'],resource_name:'Santorio'});}
