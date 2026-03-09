import axiosClient from '@/services/axiosClient';

export async function fetchUserPreferences() {
    try {
        const res = await axiosClient.get('/auth/me/preferences');
        return { preferences: res.data, error: null };
    } catch (err:any) {
        const errorMsg = err.response?.data?.error || err.message || 'Erro ao buscar preferências';
        return { preferences: undefined, error: errorMsg };
    }
}

export async function updateUserPreferences(meters: string[]) {
    try {
        const res = await axiosClient.put('/auth/me/preferences', { meters });
        return { preferences: res.data.preferences, error: null };
    } catch (err:any) {
        const errorMsg = err.response?.data?.error || err.message || 'Erro ao atualizar preferências';
        return { preferences: undefined, error: errorMsg };
    }
}
