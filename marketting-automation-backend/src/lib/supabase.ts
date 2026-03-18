import { createClient } from '@supabase/supabase-js';
import config from '../config';

const isConfigured = Boolean(config.supabase.url && config.supabase.serviceRoleKey);

export const supabaseAdmin = isConfigured
	? createClient(config.supabase.url, config.supabase.serviceRoleKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false,
		},
	})
	: null;

export function hasSupabaseConfig() {
	return isConfigured;
}
