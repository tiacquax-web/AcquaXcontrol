import { useState, useEffect } from 'react';
import { getBlocks, createBlock as createBlockService, updateBlock as updateBlockService, deleteBlock as deleteBlockService } from '@/services/blocksService';
import { BlockWithComplex as Block } from '@/types/block';
import { useDebounce } from './use-debounce';
import { PermissionableEntity } from '@prisma/client';
import { BlockFull } from '@/types/fullTypes';
import { useRolePreview } from '@/contexts/RolePreviewContext';


interface useBlocksProps {
  complexId?: string
  complexSocialName?: string
  nameQuery?: string
  withComplexName?: boolean
  withApartmentsCount?: boolean
  withMetersCount?: boolean
  getAvailableForEntity?: PermissionableEntity
  take?: number
  skip?: number
  enabled?: boolean
}

export const useBlocks = ({ complexId, nameQuery, getAvailableForEntity, complexSocialName, take, skip, enabled = true, withComplexName = false, withApartmentsCount = false, withMetersCount = false }: useBlocksProps) => {
  const { isPreviewing, effectiveContext } = useRolePreview();
  const [blocks, setBlocks] = useState<BlockFull[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState(0)

  const debouncedNameQuery = useDebounce(nameQuery, 350)

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }

    const fetchBlocks = async () => {
      setLoading(true)
      try {
        const data = await getBlocks({ complexId, nameQuery: debouncedNameQuery, withComplexName, withApartmentsCount, withMetersCount, getAvailableForEntity, complexSocialName, take, skip })
        
        let list = data.list || [];
        let count = data.totalCount || 0;

        // FILTRAGEM DE SEGURANÇA NO PREVIEW MODE
        if (isPreviewing && effectiveContext) {
            // Se for morador, só vê os blocos dos apartamentos dele
            if (effectiveContext.apartments?.length > 0) {
                const allowedBlockIds = effectiveContext.apartments.map((a: any) => a.block?.id).filter(Boolean);
                list = list.filter((b: any) => allowedBlockIds.includes(b.id));
            } else if (effectiveContext.blocks?.length > 0) {
                const allowedBlockIds = effectiveContext.blocks.map((b: any) => b.id);
                list = list.filter((b: any) => allowedBlockIds.includes(b.id));
            } else if (effectiveContext.accessibleComplexIds?.length > 0) {
                list = list.filter((b: any) => effectiveContext.accessibleComplexIds.includes(b.complexId));
            }
            count = list.length;
        }

        setBlocks(list)
        setTotalCount(count)
        setError(null)
      } catch (error: any) {
        const message = error.response?.data?.error || error.message || "Unknown error"
        setError(message)
      } finally {
        setLoading(false)
      }
    }

    fetchBlocks()
  }, [complexId, debouncedNameQuery, getAvailableForEntity, complexSocialName, take, skip, enabled, withComplexName, withApartmentsCount, withMetersCount, isPreviewing, effectiveContext])

  return { blocks, loading, error, totalCount }
}

export const useBlockMutations = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createBlock = async (blockData: Block) => {
    setLoading(true)
    setError(null)
    try {
      const created = await createBlockService(blockData)
      return created
    } catch (error: any) {
      const message = error.response?.data?.error || error.message || "Unknown error"
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const updateBlock = async (blockId: string, blockData: Block) => {
    setLoading(true)
    setError(null)
    try {
      const updated = await updateBlockService(blockId, blockData)
      return updated
    } catch (error: any) {
      const message = error.response?.data?.error || error.message || "Unknown error"
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const deleteBlock = async (blockId: string) => {
    setLoading(true)
    setError(null)
    try {
      const deleted = await deleteBlockService(blockId)
      return deleted
    } catch (error: any) {
      const message = error.response?.data?.error || error.message || "Unknown error"
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return { createBlock, updateBlock, deleteBlock, loading, error }
}