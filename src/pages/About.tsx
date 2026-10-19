import { Card, Descriptions } from 'antd'
import PageHeader from '../components/PageHeader'
import { PHONE_QUERY, useMediaQuery } from '../app/useMediaQuery'

export default function About() {
  const phone = useMediaQuery(PHONE_QUERY)
  return (
    <>
      <PageHeader
        title="O aplikacji"
        subtitle="Quiz pomaga uczyć się angielskich czasowników nieregularnych: kursy z lekcjami, losowe quizy i historia wyników."
      />
      <Card>
        <Descriptions
          column={1}
          bordered
          layout={phone ? 'vertical' : 'horizontal'}
          styles={{ label: { width: phone ? undefined : 180 } }}
        >
          <Descriptions.Item label="Frontend">React 19, Vite, TypeScript, React Router</Descriptions.Item>
          <Descriptions.Item label="UI">Ant Design 6</Descriptions.Item>
          <Descriptions.Item label="Stan i dane">Redux Toolkit, RTK Query</Descriptions.Item>
          <Descriptions.Item label="Backend">Express (funkcja serverless Vercel), Postgres (Neon)</Descriptions.Item>
        </Descriptions>
      </Card>
    </>
  )
}
