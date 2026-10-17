import { Card, Descriptions, Typography } from 'antd'

export default function About() {
  return (
    <>
      <Typography.Title>About</Typography.Title>
      <Card>
        <Descriptions column={1} bordered>
          <Descriptions.Item label="Frontend">React 19, Vite, TypeScript, React Router</Descriptions.Item>
          <Descriptions.Item label="UI">Ant Design 6</Descriptions.Item>
          <Descriptions.Item label="Stan i dane">Redux Toolkit, RTK Query</Descriptions.Item>
          <Descriptions.Item label="Backend">Netlify Functions, Netlify Database</Descriptions.Item>
        </Descriptions>
      </Card>
    </>
  )
}
