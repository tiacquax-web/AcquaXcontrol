import { useState, useEffect } from 'react';
import { getBlocks, createBlock as createBlockService, updateBlock as updateBlockService, deleteBlock as deleteBlockService } from '@/services/blocksService';
import { BlockWithComplex as Block } from '@/types/block';
import { useDebounce } from './use-debounce';
import { PermissionableEntity } from '@prisma/client';
import { BlockFull } from '@/types/fullTypes';


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
  const [blocks, setBlocks] = useState<BlockFull[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState(0)

  const debouncedNameQuery = useDebounce(nameQuery, 350)

  useEffect(() => {
    // Só busca blocos se enabled for true
    if (!enabled) {
      setLoading(false)
      return
    }

    const fetchBlocks = async () => {
      setLoading(true)
      try {
        const data = await getBlocks({ complexId, nameQuery: debouncedNameQuery, withComplexName, withApartmentsCount, withMetersCount, getAvailableForEntity, complexSocialName, take, skip })
        setBlocks(data.list)
        setTotalCount(data.totalCount || 0)
        setError(null)
      } catch (error: any) {
        const message = error.response?.data?.error || error.message || "Unknown error"
        setError(message)
      } finally {
        setLoading(false)
      }
    }

    fetchBlocks()
  }, [complexId, debouncedNameQuery, getAvailableForEntity, complexSocialName, take, skip, enabled, withComplexName, withApartmentsCount, withMetersCount])

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