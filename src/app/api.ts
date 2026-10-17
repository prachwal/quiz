import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

export interface Planet {
  id: number
  name: string
  mass_kg: string
}

export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({ baseUrl: '/api' }),
  tagTypes: ['Planet'],
  endpoints: (build) => ({
    getPlanets: build.query<Planet[], void>({
      query: () => 'planets',
      transformResponse: (response: { planets: Planet[] }) => response.planets,
      providesTags: ['Planet'],
    }),
  }),
})

export const { useGetPlanetsQuery } = api
