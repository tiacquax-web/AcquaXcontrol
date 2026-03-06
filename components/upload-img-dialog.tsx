"use client"

import { Dialog, DialogTrigger, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { useState } from 'react';
import { ArrowRight, Camera } from 'lucide-react';


export default function UploadProfileImgDialog() {
    const [previewSrc, setPreviewSrc] = useState<string | null>(null);

    return (
        <Dialog>
            <DialogTrigger>
                <Camera/>
            </DialogTrigger>
            <DialogContent>
                <DialogTitle asChild>
                    <h2 className="text-lg font-bold">Alterar foto</h2>
                </DialogTitle>
                <div className="flex justify-center items-center space-x-4">
                    <div className="relative w-52 h-52">
                        <Image
                            id="profile-img"
                            src="/u.png"
                            layout="fill"
                            className="object-cover object-left rounded-full"
                            alt="Foto de perfil anterior"
                        />
                    </div>
                    
                    {previewSrc &&
                        <>
                            <ArrowRight className="text-2xl" />
                            <div className="relative w-52 h-52">
                                <Image
                                    src={previewSrc}
                                    layout="fill"
                                    alt="Nova foto de perfil"
                                    className="object-cover object-left rounded-full"
                                />
                            </div>
                        </>
                    }
                </div>
                <label className="block">
                    <span className="sr-only">Choose profile photo</span>
                    <input 
                        type="file" 
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                                const reader = new FileReader();
                                reader.onload = (event) => {
                                    setPreviewSrc(event.target?.result as string);
                                };
                                reader.readAsDataURL(file);
                            }
                        }}
                    />
                </label>
                <Button>Salvar</Button>
            </DialogContent>
        </Dialog>
    )
}