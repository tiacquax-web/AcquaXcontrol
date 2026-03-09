import axiosClient from '@/services/axiosClient';

export async function fetchCurrentUser() {
    const res = await axiosClient.get('/auth/me');
    return res.data.user;
}

export async function fetchUpdateCurrentUser(data: any) {
    try {
        const res = await axiosClient.put('/auth/me', data);
        return res.data.user;
    } catch (error: any) {
        throw error;
    }
}
