import { Typography } from 'antd'
import PlanetsView from '../features/planets/PlanetsView'

export default function Home() {
  return (
    <>
      <Typography.Title>Home</Typography.Title>
      <Typography.Paragraph type="secondary">
        Dane planet pobierane z API (RTK Query → Netlify Function → Netlify Database).
      </Typography.Paragraph>
      <PlanetsView />
    </>
  )
}
