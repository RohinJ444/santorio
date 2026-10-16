import {metadata,oauthJson} from '@/lib/server/oauth';
export function GET(){return oauthJson(metadata());}
