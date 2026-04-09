import { useHistory } from '@docusaurus/router';
import { useEffect } from 'react';

export default function Home() {
    const history = useHistory();

    useEffect(() => {
        history.replace('/cli/docs');
    }, [history]);

    return null;
}
