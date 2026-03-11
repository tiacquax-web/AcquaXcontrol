import axios from 'axios';

const NEXT_PUBLIC_API_URL = '/api';

export async function fetchUserPreferences() {
    try {
        const res = await axios.get(`${NEXT_PUBLIC_API_URL}/auth/me/preferences`, {
            withCredentials: true,
        });
        return { preferences: res.data, error: null };
    } catch (err:any) {
        const errorMsg = err.response?.data?.error || err.message || 'Erro ao buscar preferências';
        return { preferences: undefined, error: errorMsg };
    }
}

export async function updateUserPreferences(meters: string[]) {
    try {
        const res = await axios.put(`${NEXT_PUBLIC_API_URL}/auth/me/preferences`, { meters }, {
            withCredentials: true,
        });
        return { preferences: res.data.preferences, error: null };
    } catch (err:any) {
        const errorMsg = err.response?.data?.error || err.message || 'Erro ao atualizar preferências';
        return { preferences: undefined, error: errorMsg };
    }
}
